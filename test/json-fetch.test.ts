// deno-lint-ignore-file no-unused-vars no-explicit-any
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

import { JSONStreamResponse, JSONStreamRequest } from '../json-fetch.ts'
import { JSONParseStream } from '../index.ts'

test('exists', () =>{
  assertExists(JSONStreamRequest)
  assertExists(JSONStreamResponse)
})

test('simple response', async () => {
  const actual = await new JSONStreamResponse({ a: 3, b: { nested: 4 }, c: [1, 2, 3], __x: undefined }).json()
  assertEquals(actual, { a: 3, b: { nested: 4 }, c: [1, 2, 3] })
})

test('simple request', async () => {
  const actual = await new JSONStreamRequest('/', { method: 'PUT', body: { a: 3, b: { nested: 4 }, c: [1, 2, 3], __x: undefined } }).json()
  assertEquals(actual, { a: 3, b: { nested: 4 }, c: [1, 2, 3] })
})

test('with promise response', async () => {
  const actual = await new JSONStreamResponse(({ a: 3, b: Promise.resolve(4) })).json()
  assertEquals(actual, { a: 3, b: 4 })
})

test('with promise request', async () => {
  const actual = await new JSONStreamRequest('/', { method: 'PUT', body: { a: 3, b: Promise.resolve(4) } }).json()
  assertEquals(actual, { a: 3, b: 4 })
})

const timeout = (n?: number) => new Promise(r => setTimeout(r, n))
async function* asyncGen<T>(xs: T[]) {
  for (const x of xs) { await timeout(); yield x }
}

test('with generator response', async () => {
  const actual = await new JSONStreamResponse(({ a: 3, b: Promise.resolve(4), c: asyncGen([1, 2, 3]) })).text()
  assertEquals(actual, JSON.stringify({ a: 3, b: 4, c: [1, 2, 3] }))
})

test('with generator request', async () => {
  const actual = await new JSONStreamRequest('/', { method: 'PUT', body: { a: 3, b: Promise.resolve(4), c: asyncGen([1, 2, 3]) } }).json()
  assertEquals(actual, { a: 3, b: 4, c: [1, 2, 3] })
})

test('circular throws', () => {
  const a: any = { a: 3, foo: { b: 4 } }
  a.foo.a = a;
  assertRejects(() => new JSONStreamResponse((a)).json(), TypeError)
})

test('GET with body throws', () => {
  const a: any = { a: 3, foo: { b: 4 } }
  assertRejects(() => new JSONStreamRequest('/', { body: a }).json(), TypeError)
})

test('stream', async () => {
  const actual = new JSONStreamResponse(({ a: 3, b: Promise.resolve(4), c: asyncGen([1, 2, 3]) }))
  const reader = actual.body!.pipeThrough(new JSONParseStream('$.c.*')).getReader()
  assertEquals((await reader.read()).value, 1)
  assertEquals((await reader.read()).value, 2)
  assertEquals((await reader.read()).value, 3)
  assertEquals((await reader.read()).done, true)
})
