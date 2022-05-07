// deno-lint-ignore-file no-explicit-any

export interface NDJSONStringifyStreamOptions {
  fatal?: boolean
}

/** @deprecated Untested */
export class NDJSONStringifyStream extends TransformStream<any, string> {
  constructor(opts: NDJSONStringifyStreamOptions = {}) {
    super({
      transform(obj, controller) {
        try {
          controller.enqueue(JSON.stringify(obj) + '\n')
        } catch (err) {
          if (opts.fatal) controller.error(err)
        }
      },
    })
  }
}
