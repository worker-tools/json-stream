// deno-lint-ignore-file no-explicit-any
import { JSONParser } from 'https://ghuc.cc/qwtel/jsonparse/index.js';
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { asyncIterToStream } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { normalize, match } from './json-path.ts'
import { AsyncQueue } from './async-queue.ts';

async function* identity<T>(iter: Iterable<T> | AsyncIterable<T>) {
  for await (const x of iter) yield x;
}

/**
 * 
 */
export class JSONParseStream<T = any> extends TransformStream<string | BufferSource, T> {
  #promises: Map<string, ResolvablePromise<any>> = new Map()
  #queues: Map<string, AsyncQueue<any>> = new Map()

  constructor(jsonPath = '$.*') {
    let parser!: JSONParser;
    const matchNPath = normalize(jsonPath)
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = [...parser.stack.map(_ => _.key), parser.key]; // TODO: modify parser to provide key efficiently
          path[0] ||= '$';

          const nPath = normalize(path.join('.')); // FIXME: avoid string concatenation/joining
          if (match(matchNPath, nPath)) { 
            controller.enqueue(value);
          }

          // FIXME: use trie for better performance!?
          for (const matchNPath of this.#promises.keys()) {
            if (match(matchNPath, nPath)) {
              this.#promises.get(matchNPath)!.resolve(value)
              this.#promises.delete(matchNPath);
            }
          }

          for (const matchNPath of this.#queues.keys()) {
            if (match(matchNPath, nPath)) {
              this.#queues.get(matchNPath)!.push(value)
            }
          }
        };
      },
      transform: (chunk) => {
        parser.write(chunk);
      },
      flush: async () => {
        await Promise.all([...this.#queues.values()].map(q => q.return()))
      },
    });
  }

  promise<T>(jsonPath: string): Promise<T> {
    if (this.readable.locked) throw Error('Already locked')
    const p = new ResolvablePromise<T>()
    this.#promises.set(normalize(jsonPath), p);
    return p;
  }

  generator<T>(jsonPath: string): AsyncIterableIterator<T> {
    if (this.readable.locked) throw Error('Already locked')
    const q = new AsyncQueue<T>()
    this.#queues.set(normalize(jsonPath), q)
    return q;
  }

  stream<T>(jsonPath: string): ReadableStream<T> {
    return asyncIterToStream(this.generator(jsonPath));
  }
}
