import { describe, expect, it, vi } from "vitest";

import { toReadableStream } from "../src/streams.js";

describe("toReadableStream", () => {
  it("pulls lazily and closes the source when cancelled", async () => {
    const close = vi.fn(async () => ({
      done: true as const,
      value: undefined,
    }));
    const next = vi.fn()
      .mockResolvedValueOnce({ done: false, value: "first" })
      .mockResolvedValueOnce({ done: false, value: "second" });
    const source: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({
        next,
        return: close,
      }),
    };

    const reader = toReadableStream(source).getReader();
    expect(next).not.toHaveBeenCalled();

    await expect(reader.read()).resolves.toEqual({
      done: false,
      value: "first",
    });
    expect(next).toHaveBeenCalledTimes(1);

    await reader.cancel("finished");
    expect(close).toHaveBeenCalledWith("finished");
  });

  it("propagates iterator failures to the reader", async () => {
    const failure = new Error("stream failed");
    const source: AsyncIterable<never> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          throw failure;
        },
      }),
    };

    const reader = toReadableStream(source).getReader();
    await expect(reader.read()).rejects.toBe(failure);
  });
});
