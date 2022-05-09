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

import { jsonStringifyGenerator, jsonStringifyStream } from '../json-stringify.ts'
import { JSONParseStream, JSONParseNexus } from '../json-parse-stream.ts'

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
  const parseStream = new JSONParseNexus()
  const actual = {
    type: parseStream.lazy('$.type'),
    items: parseStream.iterable('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!
    .pipeThrough(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value II', async () => {
  const parseStream = new JSONParseNexus()
  const actual = {
    type: parseStream.lazy('$.type'),
    items: parseStream.stream('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!
    .pipeThrough(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value III', async () => {
  const parseStream = new JSONParseNexus()
  const actual = {
    type: parseStream.lazy('$.type'),
    items: parseStream.iterable('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!.pipeThrough(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value IV', async () => {
  const parseStream = new JSONParseNexus()
  const actual = {
    type: parseStream.lazy('$.type'),
    items: parseStream.stream('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!.pipeThrough(parseStream)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

async function* asyncGen<T>(xs: T[]) {
  for (const x of xs) yield x
}

const json1 = { filler: asyncGen(['__', '__', '__']), type: 'foo', items: asyncGen([{ a: 1 }, { a: 2 }, { a: 3 }, { a: 4 }, { a: 5 }]) }
test('read only until first value eager', async () => {
  const parseStream = new JSONParseNexus()
  const type = parseStream.eager<string>('$.type');
  jsonStringifyStream(json1).pipeThrough(parseStream)

  assertEquals(await type, 'foo')
})
const timeout = (n?: number) => new Promise(r => setTimeout(r, n))

test('read only until first value lazy', async () => {
  const parseStream = new JSONParseNexus()
  const type = parseStream.promise<string>('$.type');
  jsonStringifyStream(json1).pipeThrough(parseStream)

  assertEquals(await Promise.race([type, timeout(10).then(() => 'x')]), 'x')
})

test('read only until first value lazy II', async () => {
  const parseStream = new JSONParseNexus()
  const type = parseStream.promise<string>('$.type');
  const _items = parseStream.stream('$.items.*') 
  jsonStringifyStream(json1).pipeThrough(parseStream)

  assertEquals(await Promise.race([type, timeout(10).then(() => 'x')]), 'x')
})

test('read only until first value lazy+pull', async () => {
  const parseStream = new JSONParseNexus()
  const type = parseStream.promise<string>('$.type');
  jsonStringifyStream(json1).pipeThrough(parseStream)

  assertEquals(await type.pull(), 'foo')
})

test('writable locked?', async () => {
  const parseStream = new JSONParseNexus()
  const filler = parseStream.stream<string>('$.filler.*');
  const items = parseStream.stream<string>('$.items.*');
  // jsonStringifyStream(json1).pipeThrough(parseStream)
  // assertEquals(await type.pull(), 'foo')
})