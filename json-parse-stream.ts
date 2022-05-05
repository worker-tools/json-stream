// deno-lint-ignore-file no-explicit-any
import { JSONParser } from 'https://ghuc.cc/qwtel/jsonparse/index.js';
import { normalize, match } from './json-path.ts'

export class JSONParseStream<T = any> extends TransformStream<string | BufferSource, T> {
  constructor(jsonPath = '$.*') {
    let parser!: JSONParser;
    const matchPath = normalize(jsonPath)
    super({
      start: (controller) => {
        parser = new JSONParser();
        parser.onValue = (value: T) => {
          const path = [...parser.stack.map(_ => _.key), parser.key]; // TODO: modify parser to provide key efficiently
          path[0] ||= '$';

          const nPath = normalize(path.join('.')); // FIXME: avoid string concatenation/joining
          if (match(matchPath, nPath)) { 
            controller.enqueue(value);
          }
        };
      },
      transform: (chunk) => {
        parser.write(chunk);
      },
    });
  }
}
