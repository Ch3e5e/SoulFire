import { describe, expect, it, vi } from "vitest";

import { SoulFire } from "../src/client.js";
import { resolveRelease } from "../src/local-server.js";

describe("SoulFire", () => {
  it("creates a scoped bot through the public connection hierarchy", async () => {
    const soulfire = SoulFire.connect({
      baseUrl: "https://soulfire.example.com/",
      token: "token",
    });

    const bot = soulfire.instance("instance-id").bot("bot-id");

    expect(bot.instanceId).toBe("instance-id");
    expect(bot.id).toBe("bot-id");
    expect(soulfire.localServer).toBeUndefined();
    await soulfire.close();
  });
});

describe("release resolution", () => {
  it("uses the latest official SoulFire release by default", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        assets: [],
        tag_name: "2.9.1",
      }),
    );

    const release = await resolveRelease(undefined, fetch);

    expect(release.tag_name).toBe("2.9.1");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/soulfiremc-com/SoulFire/releases/latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": "@soulfiremc/sdk",
        }),
      }),
    );
  });

  it("escapes an explicitly requested release tag", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        assets: [],
        tag_name: "release/candidate",
      }),
    );

    await resolveRelease("release/candidate", fetch);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/soulfiremc-com/SoulFire/releases/tags/release%2Fcandidate",
      expect.anything(),
    );
  });
});
