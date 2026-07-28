import { Effect, Queue, Stream } from "effect";

const END = Symbol("ReplayBroadcastEnd");

export class ReplayBroadcast<A> {
  readonly #history: A[] = [];
  readonly #subscribers = new Set<Queue.Enqueue<A | typeof END>>();
  readonly #mutex = Effect.runSync(Effect.makeSemaphore(1));
  #ended = false;

  public constructor(private readonly replay: number) {
    if (!Number.isSafeInteger(replay) || replay < 0) {
      throw new RangeError("replay must be a non-negative safe integer");
    }
  }

  public readonly stream: Stream.Stream<A> = Stream.unwrapScoped(
    Effect.gen(this, function* () {
      const queue = yield* Queue.unbounded<A | typeof END>();
      const ended = yield* this.#mutex.withPermits(1)(
        Effect.gen(this, function* () {
          const ended = this.#ended;
          if (!ended) {
            this.#subscribers.add(queue);
          }
          yield* Queue.offerAll(queue, this.#history);
          if (ended) {
            yield* Queue.offer(queue, END);
          }
          return ended;
        }),
      );
      if (!ended) {
        yield* Effect.addFinalizer(() =>
          this.#mutex.withPermits(1)(
            Effect.sync(() => {
              this.#subscribers.delete(queue);
            }),
          ).pipe(Effect.zipRight(Queue.shutdown(queue)))
        );
      }
      return Stream.fromQueue(queue).pipe(
        Stream.takeWhile((value) => value !== END),
        Stream.map((value) => value as A),
      );
    }),
  );

  public publish(value: A): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(
      Effect.gen(this, function* () {
        if (this.#ended) {
          return;
        }
        if (this.replay > 0) {
          this.#history.push(value);
          if (this.#history.length > this.replay) {
            this.#history.splice(0, this.#history.length - this.replay);
          }
        }
        yield* Effect.forEach(
          this.#subscribers,
          (subscriber) => Queue.offer(subscriber, value),
          { discard: true },
        );
      }),
    );
  }

  public end(): Effect.Effect<void> {
    return this.#mutex.withPermits(1)(
      Effect.gen(this, function* () {
        if (this.#ended) {
          return;
        }
        this.#ended = true;
        yield* Effect.forEach(
          this.#subscribers,
          (subscriber) => Queue.offer(subscriber, END),
          { discard: true },
        );
        this.#subscribers.clear();
      }),
    );
  }
}
