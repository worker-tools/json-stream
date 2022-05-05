import { JSONParser } from 'https://ghuc.cc/qwtel/jsonparse/index.js';

export class JSONParseStream<T = any> extends TransformStream<string|BufferSource, T> {
  constructor(/* TODO */) {
    let parser!: JSONParser;
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          controller.enqueue(value);
        };
      },
      transform: (chunk) => {
        parser.write(chunk);
      },
    });
  }
}
