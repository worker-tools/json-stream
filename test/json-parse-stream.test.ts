// deno-lint-ignore-file no-explicit-any no-unused-vars require-await
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

import { JSONParseStream } from '../json-parse-stream.ts'

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