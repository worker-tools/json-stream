// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { pipe } from 'https://cdn.skypack.dev/ts-functional-pipe@3.1.2';

const id = <T = any>(_: T) => _;

type Awaitable<T> = T | PromiseLike<T>;

// FIXME: Ugh...
class Task<T> {
  #task;
  #promise;
  #state = 'idle'

  constructor(task: () => Awaitable<T>, promise = new ResolvablePromise<T>()) {
    this.#task = task;
    this.#promise = promise;
  }

  execute() {
    if (this.#state === 'idle') {
      this.#state = 'pending'
      this.#promise.resolve(this.#task())
      this.#promise.then(() => { this.#state = 'fulfilled' }, () => { this.#state = 'rejected' })
    }
  }
  get state() { return this.#state }
  get promise() { return this.#promise }
}

const lock = Symbol('key');

// TODO: Make own module?
// TODO: Add abort signal?
export class JSONParseLazyPromise<T, TT = T> implements Promise<T> {
  #task: Task<TT>;
  #mapFn;
  #mappedPromise;

  static from<T>(task: () => Awaitable<T>) {
    return new JSONParseLazyPromise<T>(lock, new Task(task))
  }

  private constructor(
    key: symbol,
    task: Task<TT>,
    mapFn?: ((value: TT, i?: 0) => Awaitable<T>) | undefined | null,
    thisArg?: any,
  ) {
    if (key !== lock) throw Error('Illegal constructor invocation');
    this.#task = task;
    this.#mapFn = mapFn;
    this.#mappedPromise = this.#task.promise.then(mapFn && (x => mapFn.call(thisArg, x, 0)))
  }

  get state() {
    return this.#task.state;
  }

  /**
   * Starts the execution of the task associated with the lazy promise.
   * If you don't want to start the task at this moment, use `.map` instead.
   */
  then<U = T, V = never>(
    onfulfilled?: ((value: T) => Awaitable<U>) | undefined | null,
    onrejected?: ((reason: any) => Awaitable<V>) | undefined | null
  ): Promise<U | V> {
    this.#task.execute();
    return this.#mappedPromise.then(onfulfilled, onrejected)
  }

  /**
   * Applies transformations to the resolved value without triggering execution.
   * Returns another lazy promise that triggers execution via `.then`
   */
  map<U = T>(
    mapFn?: ((value: T, i?: 0) => Awaitable<U>) | undefined | null,
    thisArg?: any
  ): JSONParseLazyPromise<U, TT> {
    // @ts-ignore: types of id function (x => x) not correctly inferred...
    return new JSONParseLazyPromise(lock, this.#task, pipe(this.#mapFn??id, mapFn??id), thisArg);
  }

  catch<V = never>(onrejected?: ((reason: any) => Awaitable<V>) | null): Promise<T | V> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.finally(onfinally)
  }

  [Symbol.toStringTag] = 'JSONParseLazyPromise'
}
