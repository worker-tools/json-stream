// deno-lint-ignore-file no-explicit-any
import { asyncIterableToStream } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'

// TODO: cycles!
type VisitedWeakMap = WeakMap<any, string>;
type VisitedWeakSet = WeakSet<any>;

type Primitive = undefined | boolean | number | string | bigint | symbol;
type ToJSON = { toJSON: (key?: any) => string }
// type Awaitable<T> = T | Promise<T>;
// type ForOfAwaitable<T> = Iterable<T> | AsyncIterable<T>;

const isIterable = <T>(x: unknown): x is Iterable<T> => 
  x != null && typeof x === 'object' && Symbol.iterator in x

const isAsyncIterable = <T>(x: unknown): x is AsyncIterable<T> => 
  x != null && typeof x === 'object' && Symbol.asyncIterator in x

const isPromiseLike = <T>(x: unknown): x is PromiseLike<T> =>
  x != null && typeof x === 'object' && 'then' in x && typeof (<any>x).then === 'function'

const isToJSON = <J extends ToJSON>(x: unknown): x is J =>
  x != null && typeof x === 'object' && 'toJSON' in x;

// TODO: Add replacer
// TODO: add formatting/spaces
export async function* jsonStringifyGenerator(
  value: null | Primitive | ToJSON | any[] | Record<string, any> | PromiseLike<any> | AsyncIterable<any> | ReadableStream,
  level = 1,
): AsyncIterableIterator<string> {
  if (isAsyncIterable(value)) {
    yield '['
    let first = true;
    for await (const v of value) {
      if (!first) yield ','; else first = false;
      yield* jsonStringifyGenerator(v, level + 1)
    }
    yield ']'
  }
  else if (isPromiseLike(value)) {
    yield* jsonStringifyGenerator(await value, level + 1)
  }
  else if (Array.isArray(value)) {
    yield '['
    let first = true;
    for (const v of value) {
      if (!first) yield ','; else first = false;
      yield* jsonStringifyGenerator(v, level + 1);
    }
    yield ']'
  }
  else if (isToJSON(value)) {
    yield JSON.stringify(value)
  }
  else if (value != null && typeof value === 'object') {
    yield '{'
    let first = true;
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        if (!first) yield ','; else first = false;
        yield `${JSON.stringify(k)}:`
        yield* jsonStringifyGenerator(v, level + 1);
      }
    }
    yield '}'
  }
  else {
    yield value === undefined ? 'null' : JSON.stringify(value)
  }
}

export function jsonStringifyStream(
  value: null | Primitive | ToJSON | any[] | Record<string, any> | PromiseLike<any> | AsyncIterable<any> | ReadableStream,
): ReadableStream<string> {
  return asyncIterableToStream(jsonStringifyGenerator(value))
}
