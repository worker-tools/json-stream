// deno-lint-ignore-file

// Based on node.js event utility: <https://github.com/nodejs/node/blob/5b59e14dafb43b907e711cb418bb9c302bce2890/lib/events.js#L1017>
// Copyright Joyent, Inc. and other Node contributors.
// Licensed under the MIT license

// TODO: Move to separate module

type Resolver<T> = (value: T | PromiseLike<T>) => void;
type Rejecter = (reason?: any) => void;

function newAbortError() {
  return new DOMException('eventTargetToAsyncIter was aborted via AbortSignal', 'AbortError');
}

export interface AsyncQueueOptions {
  /**
   * An abort signal to cancel async iteration.
   */
  signal?: AbortSignal,
}

export class AsyncQueue<T = any> implements AsyncIterableIterator<T> {
  #unconsumedValues: T[] = [];
  #unconsumedPromises: { resolve: Resolver<IteratorResult<T, void>>, reject: Rejecter }[] = [];
  #signal?: AbortSignal;
  #error?: any = null;
  #finished = false;

  constructor(options?: AsyncQueueOptions) {
    const signal = options?.signal;
    if (signal?.aborted)
      throw newAbortError();
    if (this.#signal) {
      this.#signal.addEventListener('abort', this.#abortListener, { once: true });
    }
    this.#signal = signal
  }

  #errorHandler = (err: any) => {
    this.#finished = true;

    const toError = this.#unconsumedPromises.shift();

    if (toError) {
      toError.reject(err);
    } else {
      // The next time we call next()
      this.#error = err;
    }

    this.return(); 
  }

  #abortListener = () => {
    this.#errorHandler(newAbortError());
  }

  push(el: T) {
    const promise = this.#unconsumedPromises.shift();
    if (promise) {
      promise.resolve({ value: el as T, done: false }); // FIXME
    } else {
      this.#unconsumedValues.push(el as T); // FIXME
    }
  }

  // TODO: does it make sense/is it possible to add `shift` / `pop`??

  /** Alias for `next` */
  unshift(): Promise<IteratorResult<T, void>> {
    return this.next();
  }

  next(): Promise<IteratorResult<T, void>> {
    // First, we consume all unread events
    const value = this.#unconsumedValues.shift();
    if (value) {
      return Promise.resolve({ value, done: false });
    }

    // Then we error, if an error happened
    // This happens one time if at all, because after 'error'
    // we stop listening
    if (this.#error) {
      const p = Promise.reject(this.#error);
      // Only the first element errors
      this.#error = null;
      return p;
    }

    // If the iterator is finished, resolve to done
    if (this.#finished) {
      return Promise.resolve({ value: undefined, done: true });
    }

    // Wait until an event happens
    return new Promise((resolve, reject) => {
      this.#unconsumedPromises.push({ resolve, reject });
    });
  }
  
  return(): Promise<IteratorResult<T, void>> {
    if (this.#signal) {
      this.#signal.removeEventListener('abort', this.#abortListener);
    }

    this.#finished = true;

    for (const promise of this.#unconsumedPromises) {
      promise.resolve({ value: undefined, done: true });
    }

    return Promise.resolve({ value: undefined, done: true });
  }

  throw(err: any): Promise<IteratorResult<T, void>> {
    // if (!err || !(err instanceof Error)) {
    //   throw new ERR_INVALID_ARG_TYPE('EventEmitter.AsyncIterator',
    //                                  'Error', err);
    // }
    this.#error = err;

    return Promise.reject(err)
  }

  [Symbol.asyncIterator](): AsyncGenerator<T> {
    return this;
  }
}
