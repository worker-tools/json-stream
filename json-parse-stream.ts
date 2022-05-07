// deno-lint-ignore-file no-explicit-any no-cond-assign ban-unused-ignore no-unused-vars
import { streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { JSONParser } from './json-parser.js';
import { normalize, match } from './json-path.ts'
// import { AsyncQueue } from './async-queue.ts';
import { BinarySplitStream } from './split-stream.ts'

async function* _identity<T>(iter: Iterable<T> | AsyncIterable<T>) {
  for await (const x of iter) yield x;
}

// FIXME: avoid string concatenation/joining
const mkPath = (parser: any) => {
  const path = [...parser.stack.map((_: any) => _.key), parser.key]; // TODO: modify parser to provide key efficiently
  path[0] = path[0] || '$';
  return normalize(path.join('.')); // FIXME: avoid string concatenation/joining
}

/**
 * 
 */
export class JSONParseStream<T = any> extends TransformStream<string | Uint8Array, T> {
  #pathMap = new Map<any, string>(); // FIXME: clear!
  #streams = new Map<string, ReadableStream<unknown>>();
  #jsonPath;

  constructor(jsonPath = '$.*') {
    let parser!: JSONParser;
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = mkPath(parser)

          // FIXME: better solution?
          this.#pathMap.set(value, path);
          controller.enqueue(value);
        };
      },
      transform: (chunk) => {
        parser.write(chunk);
      },
    });
    const expr = normalize(jsonPath)
    this.#jsonPath = expr;
  }

  #filterStream(expr: string) {
    return new TransformStream({
      transform: (value, controller) => {
        const path = this.#pathMap.get(value)!
        if (match(expr, path)) {
          controller.enqueue(value as any);
        }
      }
    })
  }

  // FIXME: Just acquiring this property will lock the internal stream. Different from regular transform stream.
  get readable(): ReadableStream<T> {
    return this.#readable.pipeThrough(this.#filterStream(this.#jsonPath))
    // NOTE: This would fix the above issue, but fails some internal assertions.
    // let cache: ReadableStream<T> | undefined;
    // const p = new Proxy(this.#internal, {
    //   get: (target, p) => {
    //     if (p === 'locked') return target.locked;
    //     cache = cache ?? target.pipeThrough(this.#filterStream(this.#jsonPath))
    //     return Reflect.get(cache, p);
    //   },
    //   has: (target, p) => {
    //     cache = cache ?? target.pipeThrough(this.#filterStream(this.#jsonPath))
    //     return Reflect.has(cache, p);
    //   },
    // })
    // return p;
  }

  #a?: ReadableStream<T>;
  get #readable() {
    return this.#a ?? super.readable
  }

  #clone() {
    const [a, b] = this.#readable.tee()
    this.#a = a;
    return b;
  }

  async promise<T = any>(jsonPath: string): Promise<T | undefined> {
    const expr = normalize(jsonPath)
    const stream = this.#clone().pipeThrough(this.#filterStream(expr))
    this.#streams.set(expr, stream)
    const { done, value } = await stream.getReader().read();
    return done ? undefined : value;
  }

  stream<T = any>(jsonPath: string): ReadableStream<T> {
    const expr = normalize(jsonPath)
    const stream = this.#clone().pipeThrough(this.#filterStream(expr))
    this.#streams.set(expr, stream)
    return stream;
  }

  iterable<T = any>(jsonPath: string): AsyncIterableIterator<T> {
    return streamToAsyncIter(this.stream(jsonPath))
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
            for await (const line of streamToAsyncIter(splitStream.readable)) {
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
