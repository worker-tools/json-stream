// deno-lint-ignore-file no-explicit-any
import { jsonStringifyGenerator } from './json-stringify.ts'

export class JSONStringifyStream extends TransformStream<any, string> {
  constructor() {
    let first: boolean;
    super({
      start(controller) {
        first = true;
        controller.enqueue('[')
      },
      async transform(obj, controller) {
        if (!first) controller.enqueue(','); else first = false;
        for await (const chunk of jsonStringifyGenerator(obj)) {
          controller.enqueue(chunk)
        }
      },
      flush(controller) {
        controller.enqueue(']')
      },
    })
  }
}
