// deno-lint-ignore-file no-explicit-any no-cond-assign ban-unused-ignore no-unused-vars
import { streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { JSONParser } from './json-parser.js';
import { normalize, match } from './json-path.ts'

async function* _identity<T>(iter: Iterable<T> | AsyncIterable<T>) {
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
            // Closing the stream early when the selected path can no longer yield values.
            controller.terminate()
          }
        };
      },
      transform: (chunk) => {
        parser.write(chunk);
      },
    });
    this.#jsonPath = expr;
  }

  get path() { return this.#jsonPath }
}

const extract = <K, V>(m: Map<K, V>, k: K) => { const v = m.get(k); m.delete(k); return v; }

/** @deprecated Rename!!! */
export class JSONParseNexus<T = any> extends TransformStream<string | Uint8Array, [string, T]> {
  #promises = new Map<string, ResolvablePromise<any>>();

  constructor() {
    let parser: JSONParser;
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = mkPath(parser)

          controller.enqueue([path, value]);

          for (const expr of this.#promises.keys()) {
            if (match(expr, path)) {
              extract(this.#promises, expr)!.resolve(value)
            } else if (expr.startsWith(path)) {
              extract(this.#promises, expr)!.resolve(undefined)
            }
          }
        };
      },
      transform(buffer) {
        console.log('starting to pull')
        // console.log('write', buffer)
        parser.write(buffer)
      },
      flush() {
        // TODO: close all open promises?
      },
    });
  }

  #filterStream(expr: string) {
    return new TransformStream({
      transform: ([path, value], controller) => {
        if (match(expr, path)) {
          controller.enqueue(value as any);
        } else if (expr.startsWith(path)) {
          controller.terminate()
          // this.#streams.delete(expr) // no longer need to track the stream
        }
      }
    })
  }

  #a?: ReadableStream<[string, T]>
  get #readable(): ReadableStream<[string, T]> {
    return this.#a ?? this.readable;
  }

  #clone(last?: boolean) {
    if (last) return this.#readable;
    const [a, b] = this.#readable.tee()
    this.#a = a;
    return b;
  }

  /**
   * Returns a promise that resolves with the value found at the provided `jsonPath` or `undefined` otherwise.
   * 
   * __Starts to pull values form the underlying sink immediately!__
   * If the value is located after a large array in the JSON, the entire array will be parsed and kept in a queue!
   * Use `lazy` instead if pulling form the stream elsewhere.
   */
  async eager<T = any>(jsonPath: string): Promise<T | undefined> {
    console.log('eager', jsonPath, this.writable.locked)
    const expr = normalize(jsonPath)
    const stream = this.#clone().pipeThrough(this.#filterStream(expr))
    // this.#streams.set(expr, stream)
    const { done, value } = await stream.getReader().read();
    // console.log('eager', value)
    return done ? undefined : value;
  }

  /**
   * Returns a promise that resolves with the value found at the provided `jsonPath` or `undefined` otherwise.
   * 
   * __Does not pull from the underlying sink on its own!__
   * If there isn't another consumer pulling past the point where the value if found, it will never resolve! 
   * Use with care!
   */
  lazy<T = any>(jsonPath: string): Promise<T | undefined> & { pull: () => Promise<T | undefined> } {
    console.log('lazy', jsonPath, this.writable.locked)
    const p = new ResolvablePromise<T | undefined>();
    this.#promises.set(normalize(jsonPath), p)
    return Object.assign(p, { pull: () => this.eager(jsonPath) })
  }

  promise<T = any>(jsonPath: string): Promise<T | undefined> & { pull: () => Promise<T | undefined> } {
    return this.lazy(jsonPath);
  }

  stream<T = any>(jsonPath: string): ReadableStream<T> {
    console.log('stream', jsonPath, this.writable.locked)
    const expr = normalize(jsonPath)
    const stream = this.#clone().pipeThrough(this.#filterStream(expr))
    // this.#streams.set(expr, stream)
    return stream;
  }

  iterable<T = any>(jsonPath: string): AsyncIterableIterator<T> {
    return streamToAsyncIter(this.stream(jsonPath))
  }
}
