// deno-lint-ignore-file no-explicit-any no-cond-assign ban-unused-ignore no-unused-vars
import { streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
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

export class JSONParseWritable<T = any> extends WritableStream<string | Uint8Array> {
  #pathMap = new Map<any, string>(); // FIXME: clear when processing is done!?
  #readable: ReadableStream<T>;
  // #streams = new Map<string, ReadableStream<unknown>>();

  constructor() {
    let parser: JSONParser;
    let readable: ReadableStream<T>
    super({
      start: (writeCtrl) => {
        parser = new JSONParser();
        readable = new ReadableStream({
          start: (readCtrl) => {
            parser.onValue = (value: T) => {
              const path = mkPath(parser)

              // FIXME: better solution?
              this.#pathMap.set(value, path);
              readCtrl.enqueue(value);
            };
          },
        })
      },
      write: (chunk) => {
        parser.write(chunk);
      },
    });
    this.#readable = readable!; // sus
  }

  #filterStream(expr: string) {
    return new TransformStream({
      transform: (value, controller) => {
        const path = this.#pathMap.get(value)!
        if (match(expr, path)) {
          controller.enqueue(value as any);
        } 
        else if (expr.startsWith(path)) {
          // Closing the stream early when the selected path can no longer yield values.
          controller.terminate()
          // this.#streams.delete(expr) // no longer need to track the stream
        }
      }
    })
  }

  get readable(): ReadableStream<T> {
    return this.#readable
  }

  #clone() {
    const [a, b] = this.#readable.tee()
    this.#readable = a;
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
