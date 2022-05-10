// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { pipe } from 'https://cdn.skypack.dev/ts-functional-pipe@3.1.2';

const id = (_: any) => _;

type Awaitable<T> = T | PromiseLike<T>;

// TODO: Make own module?
// TODO: Add abort signal?
export class JSONParseLazyPromise<T, TTask = T> implements Promise<T> {
  #task;
  #promise;
  #mapFn;
  #mappedPromise;

  constructor(
    task: () => Awaitable<TTask>,
    promise = new ResolvablePromise<TTask>(),
    mapFn?: ((value: TTask, i?: 0) => Awaitable<T>) | undefined | null,
    thisArg?: any,
  ) {
    this.#task = task;
    this.#promise = promise;
    this.#mapFn = mapFn;
    this.#mappedPromise = promise.then(mapFn && (x => mapFn.call(thisArg, x, 0)))
  }

  #execute() {
    Promise.resolve(this.#task())
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
    this.#execute();
    return this.#mappedPromise.then(onfulfilled, onrejected)
  }

  /**
   * Applies transformations to the resolved value without triggering execution.
   * Returns another lazy promise that triggers execution via `.then`
   */
  map<U = T>(
    mapFn?: ((value: T, i?: 0) => Awaitable<U>) | undefined | null,
    thisArg?: any
  ): JSONParseLazyPromise<U, TTask> {
    return new JSONParseLazyPromise(this.#task, this.#promise, pipe(this.#mapFn ?? id, mapFn ?? id), thisArg);
  }

  catch<V = never>(onrejected?: ((reason: any) => V | PromiseLike<V>) | null): Promise<T | V> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.finally(onfinally)
  }

  [Symbol.toStringTag] = 'JSONParseLazyPromise'
}
