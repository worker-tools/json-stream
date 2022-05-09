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
import { JSONParseStream, JSONParseNexus } from '../json-parse-stream.ts'

const collect = async <T>(stream: ReadableStream<T>) => {
  const collected: T[] = [];
  await stream.pipeTo(new WritableStream({ write(obj) { collected.push(obj) }}))
  return collected;
}

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
  const chunks = await collect(toReadableStream(expected)
    .pipeThrough(new JSONStringifyStream())
  );
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
  
  const actual = await collect(body.pipeThrough(new JSONParseStream()))
  
  assertEquals(expected, actual)

})

test('Retrieving multiple values and collections', async () => {
  const jsonStream = new JSONParseNexus();
  const asyncData = {
    type: jsonStream.promise('$.type'),
    items: jsonStream.stream('$.items.*'),
  };

  const nested = {
    type: "foo",
    items: [
      { "a": 1 }, 
      { "b": 2 }, 
      { "c": 3 }, 
      { "zzz": 999 }, 
    ]
  };

  new Response(JSON.stringify(nested)).body!.pipeThrough(jsonStream) 

  assertEquals(await asyncData.type, 'foo')

  // We can collect the values as before:
  const collected = await collect(asyncData.items)

  assertEquals(collected, nested.items)
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