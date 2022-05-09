// deno-lint-ignore-file no-explicit-any no-cond-assign ban-unused-ignore no-unused-vars
import { asyncIterToStream, streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
// import { AsyncQueue } from '../async-queue/index.ts';
import { JSONParser } from './json-parser.js';
import { normalize, match } from './json-path.ts'

async function* identity<T>(iter: Iterable<T> | AsyncIterable<T>) {
  for await (const x of iter) yield x;
}

// FIXME: avoid string concatenation/joining
const mkPath = (parser: any) => {
  const path = [...parser.stack.map((_: any) => _.key), parser.key]; // TODO: modify parser to provide key efficiently
  path[0] = path[0] || '$';
  return normalize(path.join('.')); // FIXME: avoid string concatenation/joining
}

export class JSONParseStream<T = any> extends TransformStream<string | Uint8Array, T> {
  #jsonPath;

  constructor(jsonPath = '$.*') {
    let parser!: JSONParser;
    const expr = normalize(jsonPath)
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = mkPath(parser)

          if (match(expr, path)) {
            controller.enqueue(value as any);
          } else if (expr.startsWith(path)) {
            controller.terminate()
          }
        };
      },
      transform: (chunk, controller) => {
        parser.write(chunk);
      },
    });
    this.#jsonPath = expr;
  }

  get path() { return this.#jsonPath }
}

const remove = <K, V>(m: Map<K, V>, k: K) => { const v = m.get(k); m.delete(k); return v; }

/** @deprecated Rename!!! */
export class JSONParseNexus<T = any> extends TransformStream<string | Uint8Array, [string, T]> {
  #queues = new Map<string, ReadableStreamDefaultController<any>>();
  #lazies = new Map<string, ResolvablePromise<any>>();
  #reader: ReadableStreamDefaultReader<[string, T]>

  constructor() {
    let parser: JSONParser;
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = mkPath(parser)

          for (const expr of this.#queues.keys()) {
            if (match(expr, path)) {
              this.#queues.get(expr)!.enqueue(value)
            } // no else if => can both be true
            if (expr.startsWith(path)) {
              remove(this.#queues, expr)!.close()
            }
          }
          for (const expr of this.#lazies.keys()) {
            if (match(expr, path)) {
              remove(this.#lazies, expr)!.resolve(value)
            } else if (expr.startsWith(path)) {
              remove(this.#lazies, expr)!.resolve(undefined)
            }
          }

          controller.enqueue([path, value]);
        };
      },
      transform(buffer) {
        // console.log('transform', buffer, controller.desiredSize)
        parser.write(buffer)
      },
    });
    this.#reader = this.readable.getReader();
  }

  /**
   * Returns a promise that resolves with the value found at the provided `jsonPath` or `undefined` otherwise.
   * 
   * __Starts to pull values form the underlying sink immediately!__
   * If the value is located after a large array in the JSON, the entire array will be parsed and kept in a queue!
   * Consider using `lazy` instead if pulling form a stream elsewhere.
   */
  async eager<U = any>(jsonPath: string): Promise<U | undefined> {
    const x = await this.stream(jsonPath).getReader().read();
    return x.done ? undefined : x.value;
  }

  /**
   * Returns a promise that resolves with the value found at the provided `jsonPath` or `undefined` otherwise.
   * 
   * __Does not pull from the underlying sink on its own!__
   * If there isn't another consumer pulling past the point where the value if found, it will never resolve! 
   * Consider using `eager` instead when running into deadlocks.
   */
  lazy<U = any>(jsonPath: string): Promise<U | undefined> & { pull: () => Promise<U | undefined> } {
    const p = new ResolvablePromise<U | undefined>();
    this.#lazies.set(normalize(jsonPath), p)
    return Object.assign(p, { pull: () => this.eager(jsonPath) })
  }

  /** @deprecated Use lazy/eager instead to meet your use case */
  promise<T = any>(jsonPath: string): Promise<T | undefined> {
    return this.eager(jsonPath);
  }

  stream<U = any>(jsonPath: string): ReadableStream<U> {
    const path = normalize(jsonPath);
    return new ReadableStream({
      start: (queue) => {
        this.#queues.set(path, queue)
      },
      pull: async (queue) => {
        // console.log('pull', jsonPath, queue.desiredSize)
        while (true) {
          const { done, value } = await this.#reader.read();
          // FIXME: avoid duplicate match
          if (done || match(value[0], path)) break;
        }
        // console.log('pull result', jsonPath, queue.desiredSize)
      },
      cancel: (err) => {
        // If one of the child streams errors, error the whole pipeline. // TODO: or should it?
        this.#reader.cancel(err)
      },
    }, { highWaterMark: 0 }) // does not pull on its own
  }

  iterable<U = any>(jsonPath: string): AsyncIterableIterator<U> {
    return streamToAsyncIter(this.stream(jsonPath))
  }
}
