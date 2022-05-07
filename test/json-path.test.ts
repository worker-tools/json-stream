// deno-lint-ignore-file no-unused-vars
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

import { normalize, match as _match } from '../json-path.ts'

function match(...args: Parameters<typeof _match>): boolean {
  return _match(normalize(args[0]), normalize(args[1]))
}

// console.log([...trace(normalize('$..*').replace(/^\$;/, ""), { a: 3, b: 4, c: 5, d: [1, 2, 3], e: { f: { g: { h: 5 } } } }, '$')])
// consume(new Response(JSON.stringify({ a: 3, b: 4, c: 5, d: [1, 2, 3], e: { f: { g: { h: 5 } } } })).body!.pipeThrough(new JSONParseStream('$..*')))

test('exists', () =>{
  assertExists(_match)
})

test('*', () =>{
  assert(match('.*', '.a'))
  assert(match('.*', '.b'))
  assert(!match('.*', '.a.b'))
})

test('..', () =>{
  assert(match('..*', '.store.price'));
  assert(match('..*', '.store.a.price'));
  assert(match('..*', '.store.a.b.price'));
  assert(match('..*', '.store.a.price.b'));
  assert(match('..*', '.store.foo'));
  assert(match('..*', '.store'));
})


test('.. with follow-up', () =>{
  assert(match('.store..price', '.store.price'));
  assert(match('.store..price', '.store.a.price'));
  assert(match('.store..price', '.store.a.b.price'));
  assert(!match('.store..price', '.store.a.price.b'));
  assert(!match('.store..price', '.store.foo'));
  assert(!match('.store..price', '.store'));
})

test('selection', () => {
  assert(match('$..foo[a,b]', '$.x.foo.a'));
  assert(match('$..foo[a,b]', '$.x.foo.b'));
  assert(!match('$..foo[a,b]', '$.x.foo.c'));
})

test('selection num', () => {
  assert(match('$..book[0,1]', '$.book[0]'));
  assert(match('$..book[0,1]', '$.book[0]'));
  assert(!match('$..book[0,1]', '$.book[2]'));
})

test('range', () => {
  assert(match('$..book[0:2]', '$.book[0]'));
  assert(match('$..book[0:2]', '$.book[0]'));
  assert(!match('$..book[0:2]', '$.book[2]'));
})
