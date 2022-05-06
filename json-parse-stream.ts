// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts';
import { asyncIterToStream } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { JSONParser } from './json-parser.js';
import { normalize, match } from './json-path.ts'
import { AsyncQueue } from './async-queue.ts';
import { BinarySplitStream } from './split-stream.ts'

async function* identity<T>(iter: Iterable<T> | AsyncIterable<T>) {
  for await (const x of iter) yield x;
}

/**
 * 
 */
export class JSONParseStream<T = any> extends TransformStream<string | Uint8Array, T> {
  #promises: Map<string, ResolvablePromise<any>> = new Map()
  #queues: Map<string, AsyncQueue<any>> = new Map()

  constructor(jsonPath = '$.*') {
    let parser!: JSONParser;
    const expr = normalize(jsonPath)
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = [...parser.stack.map(_ => _.key), parser.key]; // TODO: modify parser to provide key efficiently
          path[0] ||= '$';
          const nPath = normalize(path.join('.')); // FIXME: avoid string concatenation/joining

          if (match(expr, nPath)) { 
            controller.enqueue(value);
          }

          // FIXME: use trie for better performance!?
          for (const expr of this.#promises.keys()) {
            if (match(expr, nPath)) {
              this.#promises.get(expr)!.resolve(value)
              this.#promises.delete(expr);
            }
          }

          for (const expr of this.#queues.keys()) {
            if (match(expr, nPath)) {
              this.#queues.get(expr)!.push(value)
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

  promise<T = any>(jsonPath: string): Promise<T> {
    if (this.readable.locked) throw Error('Already locked')
    const p = new ResolvablePromise<T>()
    this.#promises.set(normalize(jsonPath), p);
    return Promise.resolve(p);
  }

  iterable<T = any>(jsonPath: string): AsyncIterableIterator<T> {
    if (this.readable.locked) throw Error('Already locked')
    const q = new AsyncQueue<T>()
    this.#queues.set(normalize(jsonPath), q)
    return identity(q);
  }

  stream<T = any>(jsonPath: string): ReadableStream<T> {
    return asyncIterToStream(this.iterable(jsonPath));
  }
}

/** @deprecated Untested */
export class ND_JSONParseStream<T = any> extends TransformStream<Uint8Array, T> {
  constructor() {
    let splitStream: BinarySplitStream;
    let writer: WritableStreamDefaultWriter;
    let decoder: TextDecoder;
    super({
      start(controller) {
        splitStream = new BinarySplitStream()
        writer = splitStream.writable.getWriter();
        decoder = new TextDecoder();
        (async () => {
          try {
            for await (const line of splitStream.readable) {
              const sLine = decoder.decode(line).trim()
              if (sLine) controller.enqueue(JSON.parse(sLine))
            }
          } catch (err) {
            writer.abort(err)
          }
        })()
      },
      transform(chunk) {
        writer.write(chunk)
      },
      flush() {
        writer.close()
      },
    })
  }
}
