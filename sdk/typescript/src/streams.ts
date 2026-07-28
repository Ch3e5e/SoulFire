/**
 * Exposes a lazy async iterable as a Web `ReadableStream`.
 *
 * The adapter advances the iterator only when the stream requests another
 * value. Cancelling the stream closes the iterator, which in turn cancels
 * SoulFire's underlying ConnectRPC stream.
 */
export function toReadableStream<Value>(
  source: AsyncIterable<Value>,
): ReadableStream<Value> {
  let iterator: AsyncIterator<Value> | undefined;

  return new ReadableStream<Value>(
    {
      async pull(controller) {
        iterator ??= source[Symbol.asyncIterator]();
        try {
          const next = await iterator.next();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(next.value);
        } catch (cause) {
          controller.error(cause);
        }
      },
      async cancel(reason) {
        if (iterator?.return !== undefined) {
          await iterator.return(reason);
        }
      },
    },
    { highWaterMark: 0 },
  );
}
