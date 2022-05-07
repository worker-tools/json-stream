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
  // #streams = new Map<string, ReadableStream<unknown>>();
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
        // Closing the stream early when the selected path can no longer yield values
        else if (expr.startsWith(path)) {
          controller.terminate()
          // this.#streams.delete(expr) // no longer need to track the stream
        }
      }
    })
  }

  // FIXME: Just acquiring this property will lock the internal stream. Different from regular transform stream.
  get readable(): ReadableStream<T> {
    return this.#readable.pipeThrough(this.#filterStream(this.#jsonPath))
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
    // this.#streams.set(expr, stream)
    const { done, value } = await stream.getReader().read();
    return done ? undefined : value;
  }

  stream<T = any>(jsonPath: string): ReadableStream<T> {
    const expr = normalize(jsonPath)
    const stream = this.#clone().pipeThrough(this.#filterStream(expr))
    // this.#streams.set(expr, stream)
    return stream;
  }

  iterable<T = any>(jsonPath: string): AsyncIterableIterator<T> {
    return streamToAsyncIter(this.stream(jsonPath))
  }
}
