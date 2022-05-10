// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { pipe } from 'https://cdn.skypack.dev/ts-functional-pipe@3.1.2';

const id = (_: any) => _;

type Awaitable<T> = T | PromiseLike<T>;

// TODO: Make own module?
// TODO: Add abort signal?
export class JSONParseLazyPromise<T, TTask = T> implements Promise<T> {
  #promise;
  #task;
  #mapFn;
  #thisArg;

  // static create<U>(task: () => Awaitable<U>): JSONParseLazyPromise<U> {
  //   this.#promise = new ResolvablePromise<T>()
  // }

  constructor(
    task: () => Awaitable<TTask>,
    mapFn?: ((value: TTask, i?: 0) => Awaitable<T>) | undefined | null,
    thisArg?: any,
  ) {
    // FIXME: Can avoid repeated creation?
    this.#promise = new ResolvablePromise<T>();
    this.#task = task;
    this.#mapFn = mapFn;
    this.#thisArg = thisArg;
  }

  #pull() {
    Promise.resolve(this.#task())
      .then(this.#mapFn && (x => this.#mapFn!.call(this.#thisArg, x, 0)))
      .then(x => this.#promise.resolve(x), err => this.#promise.reject(err));
  }

  /**
   * Starts the execution of the task associated with the lazy promise.
   * If you don't want to start the task at this moment, use `.map` instead.
   */
  then<U = T, V = never>(
    onfulfilled?: ((value: T) => Awaitable<U>) | undefined | null,
    onrejected?: ((reason: any) => Awaitable<V>) | undefined | null
  ): Promise<U | V> {
    this.#pull();
    return this.#promise.then(onfulfilled, onrejected)
  }

  /**
   * Applies transformations to the resolved value without triggering execution.
   * Returns another lazy promise that triggers execution via `.then`
   */
  map<U = T>(
    mapFn?: ((value: T, i?: 0) => Awaitable<U>) | undefined | null,
    thisArg?: any
  ): JSONParseLazyPromise<U, TTask> {
    return new JSONParseLazyPromise(this.#task, pipe(this.#mapFn ?? id, mapFn ?? id), thisArg)
  }

  catch<V = never>(onrejected?: ((reason: any) => V | PromiseLike<V>) | null): Promise<T | V> {
    return this.#promise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.#promise.finally(onfinally)
  }

  [Symbol.toStringTag] = 'JSONParseLazyPromise'
}
