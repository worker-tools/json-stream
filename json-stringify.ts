// deno-lint-ignore-file no-explicit-any
import { asyncIterableToStream } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts'

type SeenWeakSet = WeakSet<any>;

type Primitive = undefined | boolean | number | string | bigint | symbol;

export type ToJSON = { toJSON: (key?: any) => string }

const _isIterable = <T>(x: unknown): x is Iterable<T> => 
  x != null && typeof x === 'object' && Symbol.iterator in x

const isAsyncIterable = <T>(x: unknown): x is AsyncIterable<T> => 
  x != null && typeof x === 'object' && Symbol.asyncIterator in x

const isPromiseLike = <T>(x: unknown): x is PromiseLike<T> =>
  x != null && typeof x === 'object' && 'then' in x && typeof (<any>x).then === 'function'

const isToJSON = <J extends ToJSON>(x: unknown): x is J =>
  x != null && typeof x === 'object' && 'toJSON' in x;

const safeAdd = (seen: SeenWeakSet, value: any) => {
  if (seen.has(value)) throw TypeError('Converting circular structure to JSON')
  seen.add(value)
}

const check = (v: any) => {
  if (v === undefined) return false;
  const type = typeof v;
  return type !== 'function' && type !== 'symbol'
}

// TODO: Add replacer
// TODO: add formatting/spaces
/**
 * @deprecated Change name to something more descriptive!? 
 */
export async function* jsonStringifyGenerator(
  value: null | Primitive | ToJSON | any[] | Record<string, any> | PromiseLike<any> | AsyncIterable<any> | ReadableStream,
  seen: SeenWeakSet = new WeakSet(),
): AsyncIterableIterator<string> {
  if (isAsyncIterable(value)) {
    yield '['
    safeAdd(seen, value)
    let first = true;
    for await (const v of value) {
      if (!first) yield ','; else first = false;
      yield* jsonStringifyGenerator(v, seen)
    }
    seen.delete(value)
    yield ']'
  }
  else if (isPromiseLike(value)) {
    const v = await value
    if (check(v)) {
      safeAdd(seen, value)
      yield* jsonStringifyGenerator(v, seen)
      seen.delete(value)
    }
  }
  else if (isToJSON(value)) {
    const v = JSON.stringify(value);
    if (check(v)) yield v
  }
  else if (Array.isArray(value)) {
    yield '['
    safeAdd(seen, value)
    let first = true;
    for (const v of value) {
      if (!first) yield ','; else first = false;
      yield* jsonStringifyGenerator(v, seen);
    }
    seen.delete(value)
    yield ']'
  }
  else if (value != null && typeof value === 'object') {
    yield '{'
    safeAdd(seen, value)
    let first = true;
    for (const [k, v] of Object.entries(value)) {
      if (check(v)) {
        const generator = jsonStringifyGenerator(v, seen)
        const peek = await generator.next()
        if (check(peek.value)) {
          if (!first) yield ','; else first = false;
          yield `${JSON.stringify(k)}:`
          yield peek.value
          yield* generator;
        }
      }
    }
    seen.delete(value)
    yield '}'
  }
  else {
    yield check(value) ? JSON.stringify(value) : 'null'
  }
}

/**
 * @deprecated Change name to something more descriptive!? 
 */
export function jsonStringifyStream(
  value: null | Primitive | ToJSON | any[] | Record<string, any> | PromiseLike<any> | AsyncIterable<any> | ReadableStream,
): ReadableStream<string> {
  return asyncIterableToStream(jsonStringifyGenerator(value))
}
