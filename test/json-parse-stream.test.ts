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

import { jsonStringifyGenerator, jsonStringifyStream, JSONStringifyReadable } from '../json-stringify.ts'
import { JSONParseStream, JSONParseNexus } from '../json-parse-stream.ts'

async function collect<T = any>(stream: ReadableStream<T>) {
  const chunks = []
  const reader = stream.getReader();
  let result: ReadableStreamReadResult<T>
  while (!(result = await reader.read()).done) chunks.push(result.value)
  return chunks;
}

async function aCollect<T = any>(iter: AsyncIterable<T>) {
  const chunks = []
  for await (const x of iter) chunks.push(x)
  return chunks;
}

test('exists', () => {
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
  const nexus = new JSONParseNexus()
  const actual = {
    type: nexus.promise('$.type'),
    items: nexus.iterable('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!.pipeThrough(nexus)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  // console.log('actualString', actualString)
  assertEquals(actualString, expected)
})

test('promise value II', async () => {
  const nexus = new JSONParseNexus()
  const actual = {
    type: nexus.promise('$.type'),
    items: nexus.stream('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!
    .pipeThrough(nexus)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value III', async () => {
  const nexus = new JSONParseNexus()
  const actual = {
    type: nexus.promise('$.type'),
    items: nexus.iterable('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!.pipeThrough(nexus)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

test('promise value IV', async () => {
  const nexus = new JSONParseNexus()
  const actual = {
    type: nexus.promise('$.type'),
    items: nexus.stream('$.items.*')
  }
  const expected = JSON.stringify({ type: 'foo', items: [{ a: 1 }, { a: 2 }, { a: 3 }] })
  new Response(expected).body!.pipeThrough(nexus)

  const actualString = await aJoin(jsonStringifyGenerator(actual))
  assertEquals(actualString, expected)
})

async function* asyncGen<T>(xs: T[]) {
  for (const x of xs) yield x
}

const filler = new Array(10).fill('___');
const items = Array.from(new Array(10), (_, a) => ({ a }));
const json1 = () => ({
  filler: asyncGen(filler),
  type: 'foo',
  items: asyncGen(items),
  done: true,
});

// console.log(filler, items)

test('read only until first value eager', async () => {
  const nexus = new JSONParseNexus()
  const type = nexus.promise<string>('$.type');
  new JSONStringifyReadable(json1()).pipeThrough(nexus)

  assertEquals(await type, 'foo')
})

const timeout = (n?: number) => new Promise(r => setTimeout(r, n))

test('read only until first value lazy', async () => {
  const nexus = new JSONParseNexus()
  const type = nexus.promise<string>('$.type');

  let hasBeenCalled = false
  async function* asyncGen<T>(xs: T[]) {
    for (const x of xs) { yield x; hasBeenCalled = true }
  }

  new JSONStringifyReadable({ 
    items: asyncGen(items), 
    type: 'foo',
  }).pipeThrough(nexus)

  assertEquals(hasBeenCalled, false)
  assertEquals(await type, 'foo')
})

test('read only until first value lazy II', async () => {
  const nexus = new JSONParseNexus()
  const typeP = nexus.promise<string>('$.type');
  const itemsS = nexus.stream('$.items.*')

  let callCount = 0
  async function* asyncGen<T>(xs: T[]) {
    for (const x of xs) { yield x; callCount++ }
  }

  new JSONStringifyReadable({ 
    type: 'foo', 
    items: asyncGen(items),
  }).pipeThrough(nexus)

  assertEquals(callCount, 0)
  assertEquals(await typeP, 'foo')
  assertEquals(callCount, 0)
  await collect(itemsS)
  assert(callCount >= items.length)
})

test('lazy promise map', async () => {
  const nexus = new JSONParseNexus()
  const type = nexus.promise<string>('$.type')
    .map(x => x?.toUpperCase());

  let hasBeenCalled = false
  async function* asyncGen<T>(xs: T[]) {
    for (const x of xs) { yield x; hasBeenCalled = true }
  }

  new JSONStringifyReadable({ 
    items: asyncGen(items), 
    type: 'foo',
  }).pipeThrough(nexus)

  assertEquals(hasBeenCalled, false)
  assertEquals(await type, 'FOO')
  assertEquals(hasBeenCalled, true)
})

test('lazy promise map x2', async () => {
  const nexus = new JSONParseNexus()
  const type = nexus.promise<string>('$.type')
    .map(x => x?.toUpperCase())
    .map(x => `${x}!!!`)

  let hasBeenCalled = false
  async function* asyncGen<T>(xs: T[]) {
    for (const x of xs) { yield x; hasBeenCalled = true }
  }

  new JSONStringifyReadable({ 
    items: asyncGen(items), 
    type: 'foo',
  }).pipeThrough(nexus)

  assertEquals(hasBeenCalled, false)
  assertEquals(await type, 'FOO!!!')
  assertEquals(hasBeenCalled, true)
})

test('two streams', async () => {
  const nexus = new JSONParseNexus()
  const fillerS = nexus.stream<string>('$.filler.*');
  const itemsS = nexus.stream<string>('$.items.*');
  new JSONStringifyReadable(json1()).pipeThrough(nexus)
  assertEquals(await collect(fillerS), filler)
  assertEquals(await collect(itemsS), items)
})

test('two generators', async () => {
  const nexus = new JSONParseNexus()
  const fillerS = nexus.iterable<string>('$.filler.*');
  const itemsS = nexus.iterable<string>('$.items.*');
  new JSONStringifyReadable(json1()).pipeThrough(nexus)
  assertEquals(await aCollect(fillerS), filler)
  assertEquals(await aCollect(itemsS), items)
})

test('boxy selector', async () => {
  const nexus = new JSONParseNexus()
  const itemsS = nexus.stream<string>('$.items.*[a]');
  new JSONStringifyReadable(json1()).pipeThrough(nexus)
  assertEquals(await collect(itemsS), items.map(x => x.a))
})

test('from file/fetch', async () => {
  const nexus = new JSONParseNexus();
  const fillerS = nexus.iterable<string>('$.filler.*');
  const itemsS = nexus.iterable<string>('$.items.*');
  (await fetch(new URL('./json1.json', import.meta.url).href)).body!.pipeThrough(nexus)
  assertEquals((await aCollect(fillerS)).length, 300)
  assertEquals((await aCollect(itemsS)).length, 300)
})
