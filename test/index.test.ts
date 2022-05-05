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

import { jsonStringifyStream, jsonStringifyGenerator } from '../index.ts'

test('exists', () =>{
  assertExists(jsonStringifyStream)
  assertExists(jsonStringifyGenerator)
})

// const aConcat = async <T>(iter: AsyncIterable<T>) => {
//   const chunks: T[] = []
//   for await (const x of iter) chunks.push(x)
//   return chunks
// }

const aJoin = async (iter: AsyncIterable<string>, separator = '') => {
  const chunks: string[] = []
  for await (const x of iter) chunks.push(x)
  return chunks.join(separator)
}

test('simple', async () => {
  const stream = jsonStringifyStream({ a: 3, b: { nested: 4 }, c: [1, 2, 3], __x: undefined })
  assertEquals(await new Response(stream).text(), JSON.stringify({ a: 3, b: { nested: 4 }, c: [1, 2, 3] }))
})

test('simple II', async () => {
  const text = await aJoin(jsonStringifyGenerator({ a: 3, b: { nested: 4 }, c: [1, 2, 3], __x: undefined }))
  assertEquals(text, JSON.stringify({ a: 3, b: { nested: 4 }, c: [1, 2, 3] }))
})

test('with promise', async () => {
  const text = await aJoin(jsonStringifyGenerator({ a: 3, b: Promise.resolve(4) }))
  assertEquals(text, JSON.stringify({ a: 3, b: 4 }))
})

const timeout = (n?: number) => new Promise(r => setTimeout(r, n))
async function* asyncGen<T>(xs: T[]) {
  for (const x of xs) { await timeout(); yield x }
}

test('with generator', async () => {
  const text = await aJoin(jsonStringifyGenerator({ a: 3, b: Promise.resolve(4), c: asyncGen([1, 2, 3]) }))
  assertEquals(text, JSON.stringify({ a: 3, b: 4, c: [1, 2, 3] }))
})
