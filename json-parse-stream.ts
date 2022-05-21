// deno-lint-ignore-file no-explicit-any no-cond-assign ban-unused-ignore no-unused-vars
import { streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { JSONParser } from './json-parser.js';
import { TaskPromise } from './task-promise.ts';
import { normalize, match } from './json-path.ts'

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
          } else if (expr.startsWith(path + ';')) {
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

const remove = <K, V>(m: Map<K, V>, k: K) => { const v = m.get(k); m.delete(k); return v; }


/** @deprecated Rename!!! */
export class JSONParseNexus<T = any> extends TransformStream<string | Uint8Array, [string, T]> {
  #queues = new Map<string, ReadableStreamDefaultController<any>>();
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
            if (expr.startsWith(path + ';')) {
              remove(this.#queues, expr)!.close()
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

  promise<T = any>(jsonPath: string): TaskPromise<T | undefined> {
    const reader = this.stream(jsonPath).getReader();
    return TaskPromise.from(async () => {
      const x = await reader.read();
      return x.done ? undefined : x.value;
    })
  }

  stream<U = any>(jsonPath: string): ReadableStream<U> {
    const path = normalize(jsonPath);
    return new ReadableStream({
      start: (queue) => {
        this.#queues.set(path, queue)
      },
      pull: async () => {
        while (true) {
          const { done, value } = await this.#reader.read();
          // FIXME: avoid duplicate match
          if (done || match(value[0], path)) break;
        }
      },
      cancel: (err) => {
        // If one of the child streams errors, error the whole pipeline.
        // TODO: Or should it?
        this.#reader.cancel(err)
      },
    }, { highWaterMark: 0 }) // does not pull on its own
  }

  iterable<U = any>(jsonPath: string): AsyncIterableIterator<U> {
    return streamToAsyncIter(this.stream(jsonPath))
  }
}
