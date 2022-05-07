// deno-lint-ignore-file no-explicit-any
import { streamToAsyncIter } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'
import { BinarySplitStream } from './split-stream.ts'

/** @deprecated Untested */
export class NDJSONParseStream<T = any> extends TransformStream<Uint8Array, T> {
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
