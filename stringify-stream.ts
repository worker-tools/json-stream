// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts'
import { jsonStringifyGenerator } from './json-stringify.ts'

export class JSONStringifyStream extends TransformStream<any, string> {
  constructor() {
    let first: boolean;
    let done: ResolvablePromise<void>;
    super({
      start(controller) {
        first = true;
        done = new ResolvablePromise();
        controller.enqueue('[')
      },
      async transform(obj, controller) {
        try {
          for await (const chunk of jsonStringifyGenerator(obj)) {
            if (!first) controller.enqueue(','); else first = false;
            controller.enqueue(chunk)
          }
        } finally {
          done.resolve()
        }
      },
      async flush(controller) {
        await done; // FIXME: good idea?
        controller.enqueue(']')
      }
    })
  }
}

export class ND_JSONStringifyStream extends TransformStream<any, string> {
  constructor() {
    super({
      async transform(obj, controller) {
        for await (const chunk of jsonStringifyGenerator(obj)) {
          controller.enqueue(chunk)
          controller.enqueue('\n')
        }
      },
    })
  }
}