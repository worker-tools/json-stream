// deno-lint-ignore-file no-explicit-any

/** @deprecated Untested */
export class NDJSONStringifyStream extends TransformStream<any, string> {
  constructor() {
    super({
      transform(obj, controller) {
        controller.enqueue(JSON.stringify(obj))
        controller.enqueue('\n')
      },
    })
  }
}
