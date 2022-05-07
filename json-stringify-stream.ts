// deno-lint-ignore-file no-explicit-any
import { ResolvablePromise } from 'https://ghuc.cc/worker-tools/resolvable-promise/index.ts'
import { ExtendablePromise } from 'https://ghuc.cc/worker-tools/extendable-promise/index.ts'
import { jsonStringifyGenerator } from './json-stringify.ts'

export class JSONStringifyStream extends TransformStream<any, string> {
  constructor() {
    let first: boolean;
    let flushed: ResolvablePromise<void>;
    let done: ExtendablePromise<void>;
    super({
      start(controller) {
        first = true;
        flushed = new ResolvablePromise();
        done = new ExtendablePromise(flushed); 
        controller.enqueue('[')
      },
      transform(obj, controller) {
        if (!first) controller.enqueue(','); else first = false;
        const p = (async () => {
          for await (const chunk of jsonStringifyGenerator(obj)) {
            controller.enqueue(chunk)
          }
        })()
        done.waitUntil(p)
        return p;
      },
      async flush(controller) {
        flushed.resolve();
        await done; // FIXME: is this even necessary?
        controller.enqueue(']')
      }
    })
  }
}
