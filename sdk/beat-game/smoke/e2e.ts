import { create } from "@bufbuild/protobuf";
import { StructSchema, ValueSchema } from "@bufbuild/protobuf/wkt";
import {
  beatGameWithDriver,
  BeatGamePhase,
  BeatGameRunStatus,
  makeSoulFireBeatGameDriver,
} from "../dist/index.js";
import { JsonFileBeatGameCheckpointStore } from "../dist/node.js";
import {
  MinecraftAccountProto_AccountTypeProto,
  MinecraftAccountProto_OfflineJavaDataSchema,
  MinecraftAccountProtoSchema,
  SettingsNamespace_SettingsEntrySchema,
  SettingsNamespaceSchema,
} from "@soulfiremc/sdk/generated/soulfire/common_pb";
import type { SoulFireBot } from "@soulfiremc/sdk";
import { SoulFire } from "@soulfiremc/sdk/node";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readdir,
  realpath,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  Duration,
  Effect,
  Fiber,
  Ref,
  Scope,
  Stream,
} from "effect";

const execFile = promisify(execFileCallback);
const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const runId = environment(
  "SOULFIRE_E2E_RUN_ID",
  `beat-game-e2e-${randomUUID()}`,
);
const artifactDirectory = path.resolve(
  environment(
    "SOULFIRE_E2E_ARTIFACT_DIR",
    path.join(repositoryRoot, "temp", "beat-game-e2e", runId),
  ),
);
const botName = environment("SOULFIRE_E2E_BOT_NAME", "SFSmokeBot");
const smokeMode = booleanEnvironment("SOULFIRE_E2E_CONTROLLED", false)
  ? "controlled"
  : "survival";
const debugBlockBreak = booleanEnvironment(
  "SOULFIRE_E2E_DEBUG_BLOCK_BREAK",
  false,
);
const minecraftPort = 25_565;
const attachedMinecraftContainer = optionalEnvironment(
  "SOULFIRE_E2E_MINECRAFT_CONTAINER",
);
const timeoutMs = positiveIntegerEnvironment(
  "SOULFIRE_E2E_TIMEOUT_MS",
  smokeMode === "controlled" ? 45 * 60 * 1_000 : 8 * 60 * 60 * 1_000,
);
const fixtureConfiguration = {
  mode: smokeMode,
  image: environment(
    "SOULFIRE_E2E_IMAGE",
    "itzg/minecraft-server:2026.3.2-java25",
  ),
  minecraftVersion: environment(
    "SOULFIRE_E2E_MINECRAFT_VERSION",
    "1.21.11",
  ),
  seed: smokeMode === "controlled"
    ? environment("SOULFIRE_E2E_SEED", "SoulFire SDK controlled e2e")
    : optionalEnvironment("SOULFIRE_E2E_SEED"),
  attachedMinecraftContainer,
  keepContainer: booleanEnvironment("SOULFIRE_E2E_KEEP_CONTAINER", false),
} as const;

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

interface BaseMinecraftFixture {
  readonly containerName: string;
  readonly freshWorld: boolean;
  readonly managed: boolean;
  readonly port: number;
}

interface SurvivalMinecraftFixture extends BaseMinecraftFixture {
  readonly mode: "survival";
  readonly seed: string | undefined;
}

interface ControlledMinecraftFixture extends BaseMinecraftFixture {
  readonly mode: "controlled";
  readonly seed: string;
  readonly stronghold: Readonly<{ x: number; z: number }>;
  readonly spawn: Readonly<{ x: number; y: number; z: number }>;
}

type MinecraftFixture =
  | SurvivalMinecraftFixture
  | ControlledMinecraftFixture;

const program = Effect.scoped(Effect.gen(function* () {
  yield* fromPromise("create artifact directory", () =>
    mkdir(artifactDirectory, { recursive: true })
  );
  yield* writeJson("configuration.json", {
    runId,
    botName,
    timeoutMs,
    fixtureConfiguration,
  });

  const smokeScope = yield* Effect.scope;
  const fixtureFiber = yield* Effect.fork(Scope.extend(
    Effect.acquireRelease(
      startMinecraftFixture,
      stopMinecraftFixture,
    ),
    smokeScope,
  ));
  const soulfireFiber = yield* Effect.fork(Scope.extend(Effect.gen(function* () {
    const [dedicatedJar, javaPath] = yield* Effect.all(
      [findDedicatedJar, findJava],
      { concurrency: "unbounded" },
    );
    const soulfire = yield* SoulFire.install({
      directory: path.join(artifactDirectory, `soulfire-${runId}`),
      jarPath: dedicatedJar,
      javaPath,
      javaArgs: [
        "-Xms1G",
        "-Xmx4G",
        ...(debugBlockBreak
          ? [
            "-DMC_DEBUG_ENABLED=true",
            "-DMC_DEBUG_BLOCK_BREAK=true",
          ]
          : []),
      ],
      startupTimeoutMs: 180_000,
      defaultTimeoutMs: 10 * 60_000,
      onLog: (line) => {
        process.stdout.write(`[soulfire] ${line}\n`);
        void appendFile(
          path.join(artifactDirectory, "soulfire.log"),
          `${line}\n`,
        );
      },
    });
    return { dedicatedJar, javaPath, soulfire };
  }), smokeScope));
  const [fixture, soulfireRuntime] = yield* Effect.all(
    [Fiber.join(fixtureFiber), Fiber.join(soulfireFiber)],
    { concurrency: "unbounded" },
  );
  const { dedicatedJar, javaPath, soulfire } = soulfireRuntime;
  yield* record("fixture-ready", {
    ...fixture,
    dedicatedJar,
    javaPath,
  });
  yield* record("soulfire-ready", {
    server: soulfire.server,
    localServer: soulfire.localServer,
  });

  const instance = yield* soulfire.createInstance("Beat game SDK smoke");
  yield* instance.setConfigEntry({
    namespace: "bot",
    key: "address",
    value: create(ValueSchema, {
      kind: {
        case: "stringValue",
        value: `127.0.0.1:${fixture.port}`,
      },
    }),
  });
  const profileId = offlineUuid(botName);
  yield* instance.addAccounts([
    create(MinecraftAccountProtoSchema, {
      type: MinecraftAccountProto_AccountTypeProto.OFFLINE,
      profileId,
      lastKnownName: botName,
      accountData: {
        case: "offlineJavaData",
        value: create(MinecraftAccountProto_OfflineJavaDataSchema),
      },
      config: [
        create(SettingsNamespaceSchema, {
          namespace: "bot",
          entries: [
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "use-io-uring",
              value: create(ValueSchema, {
                kind: { case: "boolValue", value: false },
              }),
            }),
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "protocol-version",
              value: create(ValueSchema, {
                kind: {
                  case: "stringValue",
                  value: fixtureConfiguration.minecraftVersion,
                },
              }),
            }),
          ],
        }),
        create(SettingsNamespaceSchema, {
          namespace: "client-settings",
          entries: [
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "render-distance",
              value: create(ValueSchema, {
                kind: { case: "numberValue", value: 10 },
              }),
            }),
          ],
        }),
        create(SettingsNamespaceSchema, {
          namespace: "pathfinding",
          entries: [
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "y-rot-jitter",
              value: minMaxValue(0, 0),
            }),
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "x-rot-jitter",
              value: minMaxValue(0, 0),
            }),
          ],
        }),
        create(SettingsNamespaceSchema, {
          namespace: "auto-eat",
          entries: [
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "enabled",
              value: create(ValueSchema, {
                kind: { case: "boolValue", value: false },
              }),
            }),
          ],
        }),
        create(SettingsNamespaceSchema, {
          namespace: "auto-respawn",
          entries: [
            create(SettingsNamespace_SettingsEntrySchema, {
              key: "enabled",
              value: create(ValueSchema, {
                kind: { case: "boolValue", value: false },
              }),
            }),
          ],
        }),
      ],
    }),
  ]);
  const bot = instance.bot(profileId);
  yield* bot.start();
  yield* bot.waitForOnline().pipe(
    Effect.timeout(Duration.minutes(2)),
  );
  if (fixture.mode === "controlled") {
    yield* poll(
      rcon(fixture, "list").pipe(
        Effect.flatMap((result) =>
          result.stdout.includes(botName)
            ? Effect.succeed(result)
            : Effect.fail(new Error(`${botName} is not listed by Minecraft`))
        ),
      ),
      "Minecraft player join",
      120,
      500,
    );
  }
  yield* poll(
    bot.world.player().pipe(
      Effect.mapError((cause) => new Error("read bot readiness", { cause })),
      Effect.flatMap((player) =>
        player.dead || player.onGround
          ? Effect.succeed(player)
          : Effect.fail(new Error("Bot has not loaded its standing block"))
      ),
    ),
    "SoulFire world readiness",
    180,
    500,
  );
  yield* record("bot-online", { instanceId: instance.id, profileId });

  const joinedPlayer = yield* bot.world.player();
  const initialInventory = yield* bot.inventory.snapshot();
  const initialItems = initialInventory.slots.flatMap((slot) =>
    slot.item === undefined || slot.item.count < 1
      ? []
      : [{
        slot: slot.slot,
        itemId: slot.item.itemId,
        count: slot.item.count,
      }]
  );
  yield* record("bot-initial-state", {
    mode: fixture.mode,
    player: joinedPlayer,
    inventory: initialInventory,
  });
  if (
    fixture.mode === "survival"
    && fixture.freshWorld
    && initialItems.length > 0
  ) {
    return yield* Effect.fail(new Error(
      `Authoritative smoke bot joined with a non-empty inventory: ${
        json(initialItems)
      }`,
    ));
  }

  if (fixture.mode === "controlled") {
    yield* provisionBot(fixture, botName);
    yield* poll(
      bot.world.player().pipe(
        Effect.mapError((cause) =>
          new Error("read prepared bot position", { cause })
        ),
        Effect.flatMap((preparedPlayer) =>
          preparedPlayer.onGround
            && Math.abs((preparedPlayer.position?.y ?? 0) - fixture.spawn.y) < 1
            ? Effect.succeed(preparedPlayer)
            : Effect.fail(new Error("Bot has not reached the prepared arena"))
        ),
      ),
      "prepared arena arrival",
      120,
      250,
    );
    const player = yield* bot.world.player();
    yield* record("bot-provisioned", { player });
    yield* controlEndEncounter(
      fixture,
      botName,
      bot,
    ).pipe(Effect.forkScoped);
  }
  const checkpointStore = new JsonFileBeatGameCheckpointStore(
    path.join(artifactDirectory, "checkpoints"),
  );
  const baseDriver = makeSoulFireBeatGameDriver(bot);
  yield* baseDriver.waitForChunks(4, 60_000);
  yield* record("bot-chunks-ready", { radiusChunks: 4 });
  let lastObservedInventoryRevision: bigint | undefined;
  const driver = {
    ...baseDriver,
    observe: baseDriver.observe.pipe(
      Effect.tap((observation) => {
        if (
          observation.inventory.revision === lastObservedInventoryRevision
        ) {
          return Effect.void;
        }
        lastObservedInventoryRevision = observation.inventory.revision;
        return record("inventory-observed", {
          revision: observation.inventory.revision,
          counts: observation.inventory.counts,
        }).pipe(Effect.orDie);
      }),
    ),
    recipesFor: (resultItemId: string) =>
      baseDriver.recipesFor(resultItemId).pipe(
        Effect.tap((recipes) =>
          record("recipes-observed", {
            resultItemId,
            recipes,
          }).pipe(Effect.orDie)
        ),
      ),
    canCraft: (recipeId: string, count: number) =>
      baseDriver.canCraft(recipeId, count).pipe(
        Effect.tap((craftability) =>
          record("craftability-observed", {
            recipeId,
            count,
            craftability,
          }).pipe(Effect.orDie)
        ),
      ),
    queryBlocks: (query: Parameters<typeof baseDriver.queryBlocks>[0]) =>
      baseDriver.queryBlocks(query).pipe(
        Effect.tap((blocks) =>
          query.radius <= 0.5
            || query.selector.blockIds?.includes("minecraft:nether_portal")
            || query.selector.blockIds?.includes(
              "minecraft:end_portal_frame",
            )
            ? record("block-query", { query, blocks }).pipe(Effect.orDie)
            : Effect.void
        ),
      ),
    pathfind: (
      position: Parameters<typeof baseDriver.pathfind>[0],
      radius: number,
      policy: Parameters<typeof baseDriver.pathfind>[2],
    ) =>
      record("pathfind-started", { position, radius, policy }).pipe(
        Effect.orDie,
        Effect.zipRight(baseDriver.pathfind(position, radius, policy)),
        Effect.tap(() =>
          Effect.gen(function* () {
            const player = yield* bot.world.player();
            yield* record("pathfind-completed", {
              position,
              radius,
              playerPosition: player.position,
              playerVelocity: player.velocity,
            });
          }).pipe(Effect.orDie)
        ),
        Effect.tapErrorCause((cause) =>
          record("pathfind-failed", {
            position,
            radius,
            cause: String(cause),
          }).pipe(Effect.orDie)
        ),
      ),
    runTask: (
      task: Parameters<typeof baseDriver.runTask>[0],
      policy: Parameters<typeof baseDriver.runTask>[1],
      execution: Parameters<typeof baseDriver.runTask>[2],
    ) =>
      record("task-started", { task, policy, execution }).pipe(
        Effect.orDie,
        Effect.zipRight(baseDriver.runTask(task, policy, execution)),
        Effect.tap((result) =>
          record("task-completed", { task, result }).pipe(Effect.orDie)
        ),
        Effect.tapErrorCause((cause) =>
          record("task-failed", {
            task,
            cause: String(cause),
          }).pipe(Effect.orDie)
        ),
      ),
    act: (action: Parameters<typeof baseDriver.act>[0]) =>
      record("primitive-started", { action }).pipe(
        Effect.orDie,
        Effect.zipRight(baseDriver.act(action)),
        Effect.tap(() =>
          record("primitive-completed", { action }).pipe(Effect.orDie)
        ),
        Effect.tapErrorCause((cause) =>
          record("primitive-failed", {
            action,
            cause: String(cause),
          }).pipe(Effect.orDie)
        ),
      ),
  };
  const run = yield* beatGameWithDriver(driver, {
    runId,
    checkpointStore,
    team: { teamId: `${runId}-team` },
    strategy: {
      actionTimeoutMs: 600_000,
      observationPollMs: 250,
      entitySearchRadius: 320,
      path: {
        maxSearchTimeMs: 120_000,
      },
    },
  });
  yield* Stream.runForEach(run.events, (event) =>
    record("beat-game-event", { event })
  ).pipe(Effect.forkScoped);

  const result = yield* run.awaitCompletion.pipe(
    Effect.timeout(Duration.millis(timeoutMs)),
  );
  const finalPlayer = yield* bot.world.player();
  const finalInventory = yield* bot.inventory.snapshot();
  const eggCount = finalInventory.slots.reduce(
    (count, slot) =>
      count
      + (
        slot.item?.itemId === "minecraft:dragon_egg"
          ? slot.item.count
          : 0
      ),
    0,
  );
  if (
    result.finalCheckpoint.planner.phase !== BeatGamePhase.COMPLETE
    || result.finalCheckpoint.planner.status !== BeatGameRunStatus.COMPLETED
  ) {
    return yield* Effect.fail(new Error(
      `Beat-game run ended in ${result.finalCheckpoint.planner.phase}/${
        result.finalCheckpoint.planner.status
      }`,
    ));
  }
  if (eggCount < 1) {
    return yield* Effect.fail(new Error(
      "Beat-game run completed without the dragon egg in inventory",
    ));
  }
  if (isEnd(finalPlayer.position?.dimension ?? "")) {
    return yield* Effect.fail(new Error(
      "Beat-game run completed while the bot was still in the End",
    ));
  }
  if (fixture.mode === "survival" && fixture.freshWorld) {
    yield* assertAdminCommandPolicy(fixture);
  }
  yield* record("beat-game-completed", {
    result,
    finalPlayer,
    eggCount,
  });
}).pipe(
  Effect.timeout(Duration.millis(timeoutMs + 5 * 60_000)),
  Effect.tapErrorCause((cause) =>
    record("smoke-failed", { cause: String(cause) }).pipe(Effect.ignore)
  ),
));

const startMinecraftFixture = Effect.suspend(() => {
  const managedContainerName =
    `soulfire-beat-game-${randomUUID().slice(0, 12)}`;
  const start = Effect.gen(function* () {
    if (fixtureConfiguration.attachedMinecraftContainer !== undefined) {
      if (fixtureConfiguration.mode !== "survival") {
        return yield* Effect.fail(new Error(
          "Controlled smoke mode cannot attach to an existing Minecraft world",
        ));
      }
      const containerName = fixtureConfiguration.attachedMinecraftContainer;
      const inspection = yield* docker([
        "inspect",
        "--format",
        "{{.State.Running}}",
        containerName,
      ]);
      if (inspection.stdout.trim() !== "true") {
        return yield* Effect.fail(new Error(
          `Minecraft container ${containerName} is not running`,
        ));
      }
      const port = yield* publishedMinecraftPort(containerName);
      const fixture = {
        mode: "survival",
        containerName,
        freshWorld: false,
        managed: false,
        port,
        seed: fixtureConfiguration.seed,
      } satisfies SurvivalMinecraftFixture;
      yield* record("minecraft-attached", {
        ...fixture,
        serverType: "PAPER",
      });
      return fixture;
    }

    const containerName = managedContainerName;
    const commonArguments = [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--publish",
      `127.0.0.1:${minecraftPort}:25565`,
      "--env",
      "EULA=TRUE",
      "--env",
      "TYPE=PAPER",
      "--env",
      `VERSION=${fixtureConfiguration.minecraftVersion}`,
      "--env",
      "MEMORY=4G",
      "--env",
      "ONLINE_MODE=FALSE",
      "--env",
      "MODE=survival",
      "--env",
      "SPAWN_PROTECTION=0",
      "--env",
      "VIEW_DISTANCE=10",
      "--env",
      "SIMULATION_DISTANCE=10",
    ];

    if (fixtureConfiguration.mode === "survival") {
      const serverArguments = [
        ...commonArguments,
        "--env",
        "ENABLE_RCON=false",
      ];
      if (fixtureConfiguration.seed !== undefined) {
        serverArguments.push("--env", `SEED=${fixtureConfiguration.seed}`);
      }
      serverArguments.push(fixtureConfiguration.image);
      yield* docker(serverArguments);
      yield* waitForMinecraftServer(containerName);
      const port = yield* publishedMinecraftPort(containerName);
      const fixture = {
        mode: "survival",
        containerName,
        freshWorld: true,
        managed: true,
        port,
        seed: fixtureConfiguration.seed,
      } satisfies SurvivalMinecraftFixture;
      yield* record("minecraft-ready", {
        ...fixture,
        serverType: "PAPER",
        rconEnabled: false,
        seed: fixture.seed ?? "server-generated",
      });
      return fixture;
    }

    const seed = fixtureConfiguration.seed;
    if (seed === undefined) {
      return yield* Effect.fail(new Error(
        "The controlled smoke fixture requires a seed",
      ));
    }
    yield* docker([
      ...commonArguments,
      "--env",
      "ENABLE_RCON=true",
      "--env",
      "RCON_PASSWORD=soulfire-smoke",
      "--env",
      "DIFFICULTY=peaceful",
      "--env",
      `SEED=${seed}`,
      fixtureConfiguration.image,
    ]);
    yield* waitForMinecraftServer(containerName);
    yield* poll(
      rcon(containerName, "list"),
      "Minecraft RCON readiness",
      120,
      1_000,
    );
    const port = yield* publishedMinecraftPort(containerName);
    yield* rcon(containerName, "gamerule keep_inventory true");
    yield* rcon(containerName, "gamerule mob_griefing false");
    yield* rcon(containerName, "gamerule respawn_radius 0");
    yield* rcon(containerName, "time set day");
    yield* rcon(containerName, "weather clear");
    const locate = yield* rcon(
      containerName,
      "locate structure minecraft:stronghold",
    );
    const stronghold = parseStronghold(locate.stdout);
    const spawnCoordinates = { x: stronghold.x + 32, z: stronghold.z };
    yield* rcon(
      containerName,
      `forceload add ${spawnCoordinates.x - 16} ${
        spawnCoordinates.z - 16
      } ${spawnCoordinates.x + 16} ${spawnCoordinates.z + 16}`,
    );
    const worldSpawn = yield* rcon(
      containerName,
      `execute positioned ${spawnCoordinates.x} 0 ${
        spawnCoordinates.z
      } positioned over motion_blocking_no_leaves run setworldspawn ~ ~ ~`,
    );
    const naturalSpawn = parseWorldSpawn(worldSpawn.stdout);
    const spawn = { ...naturalSpawn, y: 49 };
    const testCorridor = {
      minimumX: stronghold.x - 16,
      maximumX: spawn.x + 63,
      minimumZ: spawn.z - 80,
      maximumZ: spawn.z + 80,
    };
    yield* rcon(
      containerName,
      `forceload add ${testCorridor.minimumX} ${testCorridor.minimumZ} ${
        testCorridor.maximumX
      } ${testCorridor.maximumZ}`,
    );
    for (
      let minimumZ = testCorridor.minimumZ;
      minimumZ <= testCorridor.maximumZ;
      minimumZ += 16
    ) {
      const maximumZ = Math.min(minimumZ + 15, testCorridor.maximumZ);
      yield* rcon(
        containerName,
        `fill ${testCorridor.minimumX} ${spawn.y + 9} ${minimumZ} ${
          testCorridor.maximumX
        } ${spawn.y + 9} ${maximumZ} stone`,
      );
      yield* rcon(
        containerName,
        `fill ${testCorridor.minimumX} ${spawn.y - 1} ${minimumZ} ${
          testCorridor.maximumX
        } ${spawn.y + 8} ${maximumZ} air`,
      );
      yield* rcon(
        containerName,
        `fill ${testCorridor.minimumX} ${spawn.y - 16} ${minimumZ} ${
          testCorridor.maximumX
        } ${spawn.y - 1} ${maximumZ} stone`,
      );
    }
    yield* rcon(
      containerName,
      `setworldspawn ${spawn.x} ${spawn.y} ${spawn.z}`,
    );
    const netherPortal = {
      x: Math.floor(spawn.x / 8),
      y: 49,
      z: Math.floor(spawn.z / 8),
    };
    yield* rcon(
      containerName,
      `execute in minecraft:the_nether run forceload add ${
        netherPortal.x - 16
      } ${netherPortal.z - 16} ${netherPortal.x + 16} ${
        netherPortal.z + 16
      }`,
    );
    yield* rcon(
      containerName,
      `execute in minecraft:the_nether run fill ${netherPortal.x - 16} ${
        netherPortal.y + 1
      } ${netherPortal.z - 16} ${netherPortal.x + 16} ${
        netherPortal.y + 12
      } ${netherPortal.z + 16} air`,
    );
    yield* rcon(
      containerName,
      `execute in minecraft:the_nether run fill ${netherPortal.x - 16} ${
        netherPortal.y
      } ${netherPortal.z - 16} ${netherPortal.x + 16} ${
        netherPortal.y
      } ${netherPortal.z + 16} stone`,
    );
    for (const command of [
      `fill ${netherPortal.x} ${netherPortal.y} ${netherPortal.z - 1} ${
        netherPortal.x
      } ${netherPortal.y} ${netherPortal.z + 2} obsidian`,
      `fill ${netherPortal.x} ${netherPortal.y + 4} ${
        netherPortal.z - 1
      } ${netherPortal.x} ${netherPortal.y + 4} ${
        netherPortal.z + 2
      } obsidian`,
      `fill ${netherPortal.x} ${netherPortal.y + 1} ${
        netherPortal.z - 1
      } ${netherPortal.x} ${netherPortal.y + 3} ${
        netherPortal.z - 1
      } obsidian`,
      `fill ${netherPortal.x} ${netherPortal.y + 1} ${
        netherPortal.z + 2
      } ${netherPortal.x} ${netherPortal.y + 3} ${
        netherPortal.z + 2
      } obsidian`,
      `fill ${netherPortal.x} ${netherPortal.y + 1} ${netherPortal.z} ${
        netherPortal.x
      } ${netherPortal.y + 3} ${
        netherPortal.z + 1
      } nether_portal[axis=z]`,
    ]) {
      yield* rcon(
        containerName,
        `execute in minecraft:the_nether run ${command}`,
      );
    }
    const fixture = {
      mode: "controlled",
      containerName,
      freshWorld: true,
      managed: true,
      port,
      seed,
      stronghold,
      spawn,
    } satisfies ControlledMinecraftFixture;
    yield* record("minecraft-ready", {
      ...fixture,
      serverType: "PAPER",
      rconEnabled: true,
      netherPortal,
    });
    return fixture;
  });

  return start.pipe(
    Effect.onError(() =>
      fixtureConfiguration.attachedMinecraftContainer !== undefined
        || fixtureConfiguration.keepContainer
        ? Effect.void
        : docker(["rm", "--force", managedContainerName]).pipe(Effect.ignore)
    ),
  );
});

function stopMinecraftFixture(
  fixture: MinecraftFixture,
): Effect.Effect<void> {
  return Effect.gen(function* () {
    const logs = yield* docker([
      "logs",
      fixture.containerName,
    ]).pipe(Effect.either);
    if (logs._tag === "Right") {
      yield* fromPromise("write Minecraft logs", () =>
        writeFile(
          path.join(artifactDirectory, "minecraft.log"),
          `${logs.right.stdout}${logs.right.stderr}`,
        )
      ).pipe(Effect.ignore);
    }
    if (fixture.managed && !fixtureConfiguration.keepContainer) {
      yield* docker([
        "rm",
        "--force",
        fixture.containerName,
      ]).pipe(Effect.ignore);
    }
  });
}

function provisionBot(
  fixture: ControlledMinecraftFixture,
  username: string,
): Effect.Effect<void, Error> {
  const commands = [
    "minecraft:cooked_beef 64",
    "minecraft:oak_log 64",
    "minecraft:cobblestone 64",
    "minecraft:iron_ingot 64",
    "minecraft:iron_pickaxe 1",
    "minecraft:water_bucket 1",
    "minecraft:flint_and_steel 1",
    "minecraft:shield 1",
    "minecraft:obsidian 64",
    "minecraft:blaze_rod 16",
    "minecraft:ender_pearl 32",
    "minecraft:ender_eye 32",
    "minecraft:bow 1",
    "minecraft:arrow 64",
    "minecraft:torch 64",
    "minecraft:diamond_sword 1",
    "minecraft:diamond_pickaxe 1",
    "minecraft:diamond_helmet 1",
    "minecraft:diamond_chestplate 1",
    "minecraft:diamond_leggings 1",
    "minecraft:diamond_boots 1",
  ].map((item) => `give ${username} ${item}`);
  return Effect.forEach([
    ...commands,
    `effect give ${username} minecraft:resistance infinite 4 true`,
    `effect give ${username} minecraft:regeneration infinite 4 true`,
    `effect give ${username} minecraft:saturation infinite 0 true`,
    `spawnpoint ${username} ${fixture.spawn.x} ${fixture.spawn.y} ${fixture.spawn.z}`,
    `tp ${username} ${fixture.spawn.x + 0.5} ${fixture.spawn.y} ${
      fixture.spawn.z + 0.5
    }`,
  ], (command) =>
    rcon(fixture.containerName, command).pipe(
      Effect.flatMap((result) =>
        /No (?:player|entity) was found|Incorrect argument/iu.test(
            result.stdout,
          )
          ? Effect.fail(new Error(
            `Minecraft rejected fixture command ${command}: ${
              result.stdout.trim()
            }`,
          ))
          : Effect.void
      ),
    ), {
    concurrency: 1,
    discard: true,
  });
}

function controlEndEncounter(
  fixture: ControlledMinecraftFixture,
  username: string,
  bot: SoulFireBot,
): Effect.Effect<never> {
  return Effect.gen(function* () {
    const prepared = yield* Ref.make(false);
    const tick = bot.world.player().pipe(
      Effect.flatMap((player) => {
        if (!isEnd(player.position?.dimension ?? "")) {
          return Effect.void;
        }
        return Ref.get(prepared).pipe(
          Effect.flatMap((isPrepared) => {
            if (isPrepared) {
              return Effect.void;
            }
            return Effect.gen(function* () {
              yield* rcon(
                fixture.containerName,
                "execute in minecraft:the_end run kill @e[type=minecraft:end_crystal]",
              );
              yield* rcon(
                fixture.containerName,
                "execute in minecraft:the_end run fill 0 48 -8 105 48 8 minecraft:end_stone",
              );
              const dragon = yield* rcon(
                fixture.containerName,
                "execute in minecraft:the_end run data merge entity @e[type=minecraft:ender_dragon,limit=1] {Health:1.0f,NoAI:1b}",
              );
              if (!dragon.stdout.includes("Modified entity data")) {
                return;
              }
              const teleported = yield* rcon(
                fixture.containerName,
                `execute in minecraft:the_end at @a[name=${username},limit=1] run tp @e[type=minecraft:ender_dragon,limit=1] ~-20 ~3 ~`,
              );
              if (!teleported.stdout.includes("Teleported")) {
                return;
              }
              yield* Ref.set(prepared, true);
              yield* record("end-encounter-prepared", {
                dragon: dragon.stdout.trim(),
                teleported: teleported.stdout.trim(),
              });
            });
          }),
        );
      }),
      Effect.catchAll(() => Effect.void),
      Effect.zipRight(Effect.sleep(1_000)),
    );
    return yield* Effect.forever(tick);
  });
}

const findDedicatedJar = fromPromise("find dedicated SoulFire JAR", async () => {
  const directory = path.join(
    repositoryRoot,
    "dedicated-launcher",
    "build",
    "libs",
  );
  const candidates = (await readdir(directory))
    .filter((name) =>
      /^SoulFireDedicated-.+\.jar$/u.test(name)
      && !name.endsWith("-javadoc.jar")
      && !name.endsWith("-sources.jar")
      && !name.endsWith("-unshaded.jar")
    );
  if (candidates.length !== 1) {
    throw new Error(
      `Expected one dedicated SoulFire JAR in ${directory}, found ${
        candidates.join(", ") || "none"
      }`,
    );
  }
  return path.join(directory, candidates[0]!);
});

const findJava = fromPromise("find Java", async () =>
  realpath(environment("SOULFIRE_E2E_JAVA_PATH", "/usr/bin/java"))
);

function docker(args: readonly string[]): Effect.Effect<CommandResult, Error> {
  return runCommand("docker", args);
}

function rcon(
  target: string | ControlledMinecraftFixture,
  command: string,
): Effect.Effect<CommandResult, Error> {
  const containerName = typeof target === "string"
    ? target
    : target.containerName;
  return docker(["exec", containerName, "rcon-cli", command]).pipe(
    Effect.tap((result) =>
      record("rcon", { command, output: result.stdout.trim() })
    ),
  );
}

function waitForMinecraftServer(
  containerName: string,
): Effect.Effect<CommandResult, Error> {
  return poll(
    docker(["logs", containerName]).pipe(
      Effect.flatMap((result) =>
        /Done \([^)]+\)! For help/iu.test(
            `${result.stdout}\n${result.stderr}`,
          )
          ? Effect.succeed(result)
          : Effect.fail(new Error("Minecraft has not finished starting"))
      ),
    ),
    "Minecraft server readiness",
    300,
    1_000,
  );
}

function publishedMinecraftPort(
  containerName: string,
): Effect.Effect<number, Error> {
  return docker([
    "port",
    containerName,
    "25565/tcp",
  ]).pipe(Effect.map((result) => parsePublishedPort(result.stdout)));
}

function assertAdminCommandPolicy(
  fixture: SurvivalMinecraftFixture,
): Effect.Effect<void, Error> {
  return docker(["logs", fixture.containerName]).pipe(
    Effect.flatMap((result) => {
      const logs = `${result.stdout}\n${result.stderr}`;
      const adminLines = logs.split(/\r?\n/u).filter((line) =>
        /\[Rcon:|issued server command:|made .* a server operator/iu.test(line)
      );
      if (adminLines.length > 0) {
        return Effect.fail(new Error(
          `Authoritative smoke violated its administrative command policy:\n${
            adminLines.join("\n")
          }`,
        ));
      }
      return record("admin-command-audit", {
        passed: true,
        rconEnabled: false,
        commandsObserved: 0,
      });
    }),
  );
}

function runCommand(
  command: string,
  args: readonly string[],
): Effect.Effect<CommandResult, Error> {
  return fromPromise(`${command} ${args.join(" ")}`, async () => {
    const result = await execFile(command, [...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  });
}

function poll<A>(
  effect: Effect.Effect<A, Error>,
  description: string,
  attempts: number,
  delayMs: number,
): Effect.Effect<A, Error> {
  return effect.pipe(
    Effect.catchAll((cause) =>
      attempts <= 1
        ? Effect.fail(new Error(`${description} did not become ready`, {
          cause,
        }))
        : Effect.sleep(delayMs).pipe(
          Effect.zipRight(poll(
            effect,
            description,
            attempts - 1,
            delayMs,
          )),
        )
    ),
  );
}

function record(
  kind: string,
  value: Readonly<Record<string, unknown>>,
): Effect.Effect<void, Error> {
  return Effect.suspend(() => {
    const line = json({ observedAt: new Date().toISOString(), kind, ...value });
    process.stdout.write(`${line}\n`);
    return fromPromise(`record ${kind}`, () =>
      appendFile(path.join(artifactDirectory, "events.ndjson"), `${line}\n`)
    );
  });
}

function writeJson(
  filename: string,
  value: unknown,
): Effect.Effect<void, Error> {
  return fromPromise(`write ${filename}`, () =>
    writeFile(path.join(artifactDirectory, filename), `${json(value, 2)}\n`)
  );
}

function fromPromise<A>(
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof Error
        ? new Error(`${operation}: ${cause.message}`, { cause })
        : new Error(`${operation}: ${String(cause)}`),
  });
}

function parsePublishedPort(output: string): number {
  const match = output.trim().match(/:(\d+)$/u);
  const value = Number(match?.[1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`Could not parse Minecraft port from ${JSON.stringify(output)}`);
  }
  return value;
}

function parseStronghold(output: string): Readonly<{ x: number; z: number }> {
  const match = output.match(/\[\s*(-?\d+)\s*,\s*(?:~|-?\d+)\s*,\s*(-?\d+)\s*\]/u);
  if (match === null) {
    throw new Error(
      `Could not parse stronghold coordinates from ${JSON.stringify(output)}`,
    );
  }
  return { x: Number(match[1]), z: Number(match[2]) };
}

function parseWorldSpawn(
  output: string,
): Readonly<{ x: number; y: number; z: number }> {
  const match = output.match(
    /Set the world spawn point to\s+(-?\d+),\s*(-?\d+),\s*(-?\d+)/iu,
  );
  if (match === null) {
    throw new Error(
      `Could not parse world spawn coordinates from ${JSON.stringify(output)}`,
    );
  }
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

function offlineUuid(username: string): string {
  const bytes = createHash("md5")
    .update(`OfflinePlayer:${username}`, "utf8")
    .digest();
  bytes[6] = (bytes[6]! & 0x0f) | 0x30;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function isEnd(dimension: string): boolean {
  return dimension === "minecraft:the_end" || dimension.endsWith(":the_end");
}

function environment(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? fallback : value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function minMaxValue(min: number, max: number) {
  return create(ValueSchema, {
    kind: {
      case: "structValue",
      value: create(StructSchema, {
        fields: {
          min: create(ValueSchema, {
            kind: { case: "numberValue", value: min },
          }),
          max: create(ValueSchema, {
            kind: { case: "numberValue", value: max },
          }),
        },
      }),
    },
  });
}

function booleanEnvironment(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

function positiveIntegerEnvironment(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  const parsed = value === undefined || value.length === 0
    ? fallback
    : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function json(value: unknown, indentation?: number): string {
  return JSON.stringify(value, (_, nested) =>
    typeof nested === "bigint" ? nested.toString() : nested, indentation
  );
}

NodeRuntime.runMain(program.pipe(
  Effect.tap(() =>
    Effect.sync(() => {
      process.stdout.write(
        `Beat-game E2E smoke passed. Artifacts: ${artifactDirectory}\n`,
      );
    })
  ),
  Effect.tapErrorCause((cause) =>
    Effect.sync(() => {
      process.stderr.write(
        `Beat-game E2E smoke failed. Artifacts: ${artifactDirectory}\n${
          String(cause)
        }\n`,
      );
    })
  ),
));
