// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore no-cond-assign
import 'https://gist.githubusercontent.com/qwtel/b14f0f81e3a96189f7771f83ee113f64/raw/TestRequest.ts'
import {
  assert,
  assertExists,
  assertEquals,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
  assertRejects,
  assertArrayIncludes,
} from 'https://deno.land/std@0.133.0/testing/asserts.ts'
const { test } = Deno;

import { JSONStringifyStream } from '../json-stringify-stream.ts'
import { JSONParseStream } from '../json-parse-stream.ts'
import { jsonStringifyStream } from '../json-stringify.ts'

function toReadableStream<T>(iter: Iterable<T>) {
  const data = [...iter];
  let v: T | undefined;
  return new ReadableStream<T>({
    pull(ctrl) { 
      if (v = data.shift()) ctrl.enqueue(v); else ctrl.close();
    },
  });
}

test('stringify stream', async () => {
  const expected = [
    { a: 1 }, 
    { b: 2}, 
    { c: 3 }, 
    'foo', 
    { a: { nested: { object: true }} }
  ];
  const chunks: string[] = []
  await toReadableStream(expected)
    .pipeThrough(new JSONStringifyStream())
    .pipeTo(new WritableStream({ write(chunk) { chunks.push(chunk) }}))
  const actual = JSON.parse(chunks.join(''))
  assertEquals(actual, expected)
})

test('roundtrip', async () => {
  const expected = [
    { a: 1 }, 
    { b: 2}, 
    { c: 3 }, 
    'foo', 
    { a: { nested: { object: true }} }
  ];
  const body = toReadableStream(expected)
    .pipeThrough(new JSONStringifyStream())
    .pipeThrough(new TextEncoderStream())
  
  const actual: any[] = [];
  await body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new JSONParseStream())
    .pipeTo(new WritableStream({ write(obj) { actual.push(obj) }}))
  
  assertEquals(expected, actual)

})

// test('foo', async () => {
//   const stream = jsonStringifyStream({
//     type: Promise.resolve('foo'),
//     data: (async function* () {
//       yield { a: 1 } 
//       yield { b: 2 } 
//       yield { c: 3 } 
//       yield Promise.resolve({ zzz: 999 })
//     })(),
//   })
//   stream
//     .pipeTo(new WritableStream({ write(chunk) { console.log(chunk) }}))
// })