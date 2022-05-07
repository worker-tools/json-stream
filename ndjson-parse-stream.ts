// deno-lint-ignore-file no-explicit-any
import { BinarySplitStream } from './split-stream.ts'

export interface NDJSONParseStreamOptions {
  fatal?: boolean
}

/** @deprecated Untested */
export class NDJSONParseStream<T = any> extends TransformStream<Uint8Array, T> {
  constructor(opts: NDJSONParseStreamOptions = {}) {
    let writer: WritableStreamDefaultWriter;
    super({
      start(controller) {
        let decoder: TextDecoder;
        const splitStream = new BinarySplitStream()
        writer = splitStream.writable.getWriter();
        splitStream.readable.pipeTo(new WritableStream({
          start() {
            decoder = new TextDecoder();
          },
          write(line) {
            const sLine = decoder.decode(line).trim()
            if (sLine) {
              try {
                controller.enqueue(JSON.parse(sLine))
              } catch (err) {
                if (opts.fatal) controller.error(err)
              }
            }
          },
        })).catch(err => controller.error(err));
      },
      transform(chunk) {
        writer.write(chunk)
      },
      flush() {
        // TODO: this is not right...
        writer.close()
      },
    })
  }
}
