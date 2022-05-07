// deno-lint-ignore-file no-explicit-any no-unused-vars require-await ban-unused-ignore
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

import { jsonStringifyGenerator } from '../json-stringify.ts'
import { JSONParseStream, JSONParseWritable } from '../json-parse-stream.ts'

async function consume(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done) { /* NOOP */ }
}

async function collect<T = any>(stream: ReadableStream) {
  const chunks = []
  const reader = stream.getReader();
  let result: ReadableStreamReadResult<T>
  while (!(result = await reader.read()).done) chunks.push(result.value)
  return chunks;
}

test('exists', () =>{
  assertExists(JSONParseStream)
})

test('ctor', () => {
  const x = new JSONParseStream()
  assertExists(x)
  assertExists(x.readable)
  assertExists(x.writable)
})

test('simple', async () => {
  const res = await collect(new Response(JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }])).body!
    .pipeThrough(new JSONParseStream()))
  assertEquals(res, [{ a: 1 }, { b: 2 }, { c: 3 }])
})

test('simple reader read', async () => {
  const reader = new Response(JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }])).body!
    .pipeThrough(new JSONParseStream())
    .getReader()
  assertEquals((await reader.read()).value, { a: 1 })
  assertEquals((await reader.read()).value, { b: 2 })
  assertEquals((await reader.read()).value, { c: 3 })
  assertEquals((await reader.read()).done, true)
})

test('read all', async () => {
  const stream = new Response(JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }])).body!
    .pipeThrough(new JSONParseStream('$..*'))
  const reader = stream.getReader()
  assertEquals((await reader.read()).value, 1)
  assertEquals((await reader.read()).value, { a: 1 })
  assertEquals((await reader.read()).value, 2)
  assertEquals((await reader.read()).value, { b: 2 })
  assertEquals((await reader.read()).value, 3)
  assertEquals((await reader.read()).value, { c: 3 })
  assertEquals((await reader.read()).done, true)
})

const aJoin = async (iter: AsyncIterable<string>, separator = '') => {
  const chunks: string[] = []
  for await (const x of iter) chunks.push(x)
  return chunks.join(separator)
}

test('promise value', async () => {
  const parseStream = new JSONParseWritable()
  const actual = {
    type: parseStream.promise('$.type'),
    data: parseStream.iterable('$.data.*')
  }
  const expected = JSON.stringify({ type: 'foo', data: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  const done = new Response(expected).body!
    .pipeTo(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
  await done;
})

test('promise value II', async () => {
  const parseStream = new JSONParseWritable()
  const actual = {
    type: parseStream.promise('$.type'),
    data: parseStream.stream('$.data.*')
  }
  const expected = JSON.stringify({ type: 'foo', data: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  const done = new Response(expected).body!
    .pipeTo(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
  await done;
})

test('promise value III', async () => {
  const parseStream = new JSONParseWritable()
  const actual = {
    type: parseStream.promise('$.type'),
    data: parseStream.iterable('$.data.*')
  }
  const expected = JSON.stringify({ type: 'foo', data: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  new Response(expected).body!.pipeTo(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value IV', async () => {
  const parseStream = new JSONParseWritable()
  const actual = {
    type: parseStream.promise('$.type'),
    data: parseStream.stream('$.data.*')
  }
  const expected = JSON.stringify({ type: 'foo', data: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  new Response(expected).body!.pipeTo(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('read only until first value', async () => {
  const parseStream = new JSONParseWritable()
  const type = parseStream.promise('$.type');
  const expected = JSON.stringify({ type: 'foo', data: [{ a: 1 }, { b: 2 }, { c: 3 }] })
  new Response(expected).body!.pipeTo(parseStream)
  assertEquals(await type, 'foo')
})