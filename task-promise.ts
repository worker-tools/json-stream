// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { pipe } from 'https://cdn.skypack.dev/ts-functional-pipe@3.1.2?dts';

const id = <T = any>(_: T) => _;

type Awaitable<T> = T | PromiseLike<T>;

export type TaskState = 'idle' | 'pending' | 'fulfilled' | 'rejected';

class Task<T> {
  #task;
  #promise;
  #state: TaskState = 'idle'

  constructor(task: () => Awaitable<T>) {
    this.#task = task;
    this.#promise = new ResolvablePromise<T>();
  }

  execute() {
    if (this.#state === 'idle') {
      this.#state = 'pending'
      this.#promise.resolve(this.#task())
      this.#promise.then(
        () => { this.#state = 'fulfilled' }, 
        () => { this.#state = 'rejected' },
      );
    }
  }
  get state(): TaskState { return this.#state }
  get promise(): Promise<T> { return this.#promise }
}

const lock = Symbol('key');

// TODO: Make own module?
// TODO: Add abort signal?
// TODO: use executor instead of task functions?
// TODO: Remove TT type??
export class TaskPromise<T, TT = T> implements Promise<T> {
  #task: Task<TT>;
  #mapFn;
  #mappedPromise;

  static from<T>(task: () => Awaitable<T>) {
    return new TaskPromise<T>(lock, new Task(task))
  }

  private constructor(
    key: symbol,
    task: Task<TT>,
    mapFn?: ((value: TT, i?: 0, p?: TaskPromise<T, TT>) => Awaitable<T>) | undefined | null,
    thisArg?: any,
  ) {
    if (key !== lock) throw Error('Illegal constructor');
    this.#task = task;
    this.#mapFn = mapFn;
    this.#mappedPromise = this.#task.promise.then(mapFn && (x => mapFn.call(thisArg, x, 0, this)));
  }

  get state() {
    return this.#task.state;
  }

  /**
   * Starts the execution of the task associated with this task promise.
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
   * Returns another task promise that triggers execution via `.then`
   */
  map<U = T>(
    mapFn?: ((value: T, i?: 0, p?: TaskPromise<T, TT>) => Awaitable<U>) | undefined | null,
    thisArg?: any
  ): TaskPromise<U, TT> {
    // @ts-ignore: types of id function (x => x) not correctly inferred...
    return new TaskPromise(lock, this.#task, pipe(this.#mapFn??id, mapFn??id), thisArg);
  }

  catch<V = never>(onrejected?: ((reason: any) => Awaitable<V>) | null): Promise<T | V> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    // FIXME: should this also trigger execution?
    return this.#mappedPromise.finally(onfinally)
  }

  readonly [Symbol.toStringTag] = 'TaskPromise'
}
