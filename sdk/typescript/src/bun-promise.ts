import type { SoulFireInstallOptions } from "./install-types.js";
import { SoulFire as EffectSoulFire } from "./bun.js";
import { SoulFire as UniversalSoulFire } from "./promise-client.js";

export * from "./promise.js";

export const SoulFire = {
  connect(
    options: Parameters<typeof UniversalSoulFire.connect>[0],
  ): Promise<UniversalSoulFire> {
    return UniversalSoulFire.fromEffect(EffectSoulFire.connect(options));
  },
  unauthenticated:
    UniversalSoulFire.unauthenticated.bind(UniversalSoulFire),
  install(
    options: SoulFireInstallOptions = {},
  ): Promise<UniversalSoulFire> {
    return UniversalSoulFire.fromEffect(EffectSoulFire.install(options));
  },
} as const;
