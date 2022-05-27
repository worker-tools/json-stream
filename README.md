# JSON Stream

Utilities for working with streaming JSON in Worker Runtimes such as Cloudflare Workers, Deno Deploy and Service Workers.

***

__Work in Progress__: See TODOs & Deprecations

***

## Base Case
The most basic use case is turning a stream of objects into stream of strings that can be sent over the wire.
On the other end, it can be turned back into a stream of JSON objects. 
For this `JSONStringifyStream` and `JSONParseStream` are all that is required. 
They work practically the same as `TextEncoderStream` and `TextDecoderStream`:

```js
const items = [
  { a: 1 }, 
  { b: 2}, 
  { c: 3 }, 
  'foo', 
  { a: { nested: { object: true }} }
];
const stream = toReadableStream(items)
  .pipeThrough(new JSONStringifyStream())
  .pipeThrough(new TextEncoderStream())

// Usage e.g.:
await fetch('/endpoint.json', { 
  body: stream, 
  method: 'POST', 
  headers: [['content-type', 'application/json']] 
})

// On the server side:
const collected = [];
await stream
  .pipeThrough(new JSONParseStream())
  .pipeTo(new WritableStream({ write(obj) { collected.push(obj) }}))

assertEquals(items, collected)
```

Note that standard JSON is used as the transport format. Unlike ND-JSON, 
neither side needs to opt-in using the streaming parser/stringifier to accept data. 
For example this is just as valid:

```js
const collected = await new Response(stream).json()
```

~~If on the other hand ND-JSON is sufficient for your use case, this module also provides `NDJSONStringifyStream` and `NDJSONParseStream` that work the same way as shown above, but lack the following features.~~ (TODO: make separate module?)

## Using JSON Path to locate nested data 
__JSON Stream__ also supports more complex use cases. Assume JSON of the following structure:

```jsonc
// filename: "nested.json"
{
  "type": "foo",
  "items": [
    { "a": 1 }, 
    { "b": 2 }, 
    { "c": 3 }, 
    // ...
    { "zzz": 999 }, 
  ]
}
```

Here, the example code from above wouldn't work (or at least not as you would expect), 
because by default `JSONParseStream` emits the objects that are the immediate children of the root object. 
However, the constructor accepts a JSONPath-like string to locate the desired data to parse:

```js
const collected = [];
await (await fetch('/nested.json')).body
  .pipeThrough(new JSONParseStream('$.items.*')) // <-- new
  .pipeTo(new WritableStream({ write(obj) { collected.push(obj) }}))
```

It's important to add the `.*` at the end, otherwise the entire items array will arrive in a singe call once it is fully parsed.

`JSONParseStream` only supports a subset of JSONPath, specifically eval (`@`) expressions and negative slices are omitted.
Below is a table showing some examples:

| JSONPath                  | Description                                                 |
|:--------------------------|:------------------------------------------------------------|
| `$.*`                     | All direct children of the root. Default.                   |
| `$.store.book[*].author`  | The authors of all books in the store                       |
| `$..author`               | All authors                                                 |
| `$.store.*`               | All things in store, which are some books and a red bicycle |
| `$.store..price`          | The price of everything in the store                        |
| `$..book[2]`              | The third book                                              |
| `$..book[0,1]`            | The first two books via subscript union                     |
| `$..book[:2]`             | The first two books via subscript array slice               |
| `$..*`                    | All members of JSON structure                               |

## Streaming Complex Data
You might also be interested in how to stream complex data such as the one above from memory.
In that case `JSONStringifyStream` isn't too helpful, as it only supports JSON arrays (i.e. the root element is an array `[]`). 

For that case __JSON Stream__ provides the `jsonStringifyStream` method (TODO: better name to indicate that it is a readableStream? Change to ReadableStream subclass? Export `JSONStream` object with `stringify` method?) which accepts any JSON-ifiable data as argument. It is mostly compatible with `JSON.stringify` (TODO: replacer & spaces), but with the important exception that it "inlines" any `Promise`, `ReadableStream` and `AsyncIterable` it encounters. Again, an example:

```js
const stream = jsonStringifyStream({
  type: Promise.resolve('foo'),
  items: (async function* () {
    yield { a: 1 } 
    yield { b: 2 } 
    yield { c: 3 } 
    // Can also have nested async values:
    yield Promise.resolve({ zzz: 999 })
  })(),
})

new Response(stream.pipeThrough(new TextEncoderStream()), {
  headers: [['content-type', 'application/json']] 
})
```

Inspecting this on the network would show the following (where every newline is a chunk):
```json
{
"type":
"foo"
,
"items":
[
{
"a":
1
}
,
{
"b":
2
}
,
{
"c":
3
}
,
{
"zzz":
999
}
]
}
```

## Retrieving Complex Structures
By providing a JSON Path to `JSONParseStream` we can stream the values of a single, nested array. 
For scenarios where the JSON structure is more complex, there is the `JSONParseNexus` (TODO: better name) class. 
It provides promise and and stream-based methods that accept JSON paths to retrieve one or multiple values respectively. 
While it is much more powerful and can restore arbitrary complex structures, it is also more difficult to use.

It's best to explain by example. Assuming the data structure from above, we have:

```js
const parser = new JSONParseNexus();
const data = {
  type: parser.promise('$.type'),
  items: parser.stream('$.items.*'),
}
(await fetch('/nested.json').body)
  .pipeThrough(parser)  // <-- new

assertEquals(await data.type, 'foo')

// We can collect the values as before:
const collected = [];
await data.items
  .pipeTo(new WritableStream({ write(obj) { collected.push(obj) }}))
```

While this works just fine, it becomes more complicated when there are multiple streams and values involved.

### Managing Internal Queues
It's important to understand that `JSONParseNexus` provides mostly pull-based APIs.
In the cause of `.stream()` and `.iterable()` no work is being done until a consumer requests a value by calling `.read()` or `.next()` respectively.
However, once a value is requested, `JSONParseNexus` will parse values until the requested JSON path is found. 
Along the way it will fill up queues for any other requested JSON paths it encounters.
This means that memory usage can grow arbitrarily large unless the data is processed in the order it was stringified:
Take for example the following structure:

```js
const parser = new JSONParseNexus();

jsonStringifyStream({
  xs: new Array(10_000).fill({ x: 'x' }),
  ys: new Array(10_000).fill({ y: 'y' }),
}).pipeThrough(parser)

for await (const y of parser.iterable('$.ys.*')) console.log(y)
for await (const x of parser.iterable('$.xs.*')) console.log(x)
```

In this examples Ys are being processed before Xs, but were stringified in the opposite order. 
This means the internal queue of Xs grows to 10.000 before it is being processed by the second loop. 
This can be avoided by changing the order to match the stringification order.

### Single Values and Lazy Promises
Special attention has to be given single values, as Promises in JS are eager by default and have no concept of "pulling" data. 
`JSONParseNexus` introduces a lazy promise type that has a different behavior. 
As with async iterables and streams provided by `.iterable` and `.stream`, it does not pull values form the underlying readable until requested. This happens when `await`ing the promise, i.e. is calling the `.then` instance method, otherwise it stays idle.

```js
const parser = new JSONParseNexus();

jsonStringifyStream({
  type: 'items',
  items: new Array(10_000).fill({ x: 'x' }),
  trailer: 'trail',
}).pipeThrough(parser)

const data = {
  type: await parser.promise('$.type') // ok
  items: parser.iterable('$.items.*')
  trailer: parser.promise('$.trailer') // do not await!
}

console.log(data.type) //=> 'items'

// Now async iteration is in control of parser:
for await (const x of data.items) {
  console.log(x)
}
// Now we can await the trailer:
console.log(await data.trailer)
```

In the above example, without lazy promises `ctrl.promise('$.trailer')` would immediately parse the entire JSON structure, which involves filling a queue of 10.000 elements.

In order to transform value without triggering executions, 
the class provides a `.map` function that works similar to JS arrays:

```js
const trailer = ctrl.promise('$.trailer').map(x => x.toUpperCase())
```

## Limitations
**JSON Stream** largely consists of old Node libraries that have been modified to work in Worker Runtimes and the browser. 
Currently they are not "integrated", for example specifying a specific JSON Path does not limit the amount of parsing the parser does.

The stringification implementation, which is original, relies heavily on async generators, which are "slow" but they made the implementation easy and quick to implement.

**JSON Stream** heavily relies on [`TransformStream`](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream), which has only recently shipped in Chrome & Safari and is still behind a flag in Firefox. However, the latest version of Deno and Cloudflare Workers support it (might require compatibility flags in CF Workers).


## Appendix
### To ReadableStream Function
An example above uses a `toReadableStream` function, which can be implemented as follows:
```ts
function toReadableStream<T>(iter: Iterable<T>) {
  const xs = [...iter];
  let x: T | undefined;
  return new ReadableStream<T>({
    pull(ctrl) { 
      if (x = xs.shift()) ctrl.enqueue(x); else ctrl.close();
    },
  });
}
```

--------

<p align="center"><a href="https://workers.tools"><img src="https://workers.tools/assets/img/logo.svg" width="100" height="100" /></a>
<p align="center">This module is part of the Worker Tools collection<br/>⁕

[Worker Tools](https://workers.tools) are a collection of TypeScript libraries for writing web servers in [Worker Runtimes](https://workers.js.org) such as Cloudflare Workers, Deno Deploy and Service Workers in the browser. 

If you liked this module, you might also like:

- 🧭 [__Worker Router__][router] --- Complete routing solution that works across CF Workers, Deno and Service Workers
- 🔋 [__Worker Middleware__][middleware] --- A suite of standalone HTTP server-side middleware with TypeScript support
- 📄 [__Worker HTML__][html] --- HTML templating and streaming response library
- 📦 [__Storage Area__][kv-storage] --- Key-value store abstraction across [Cloudflare KV][cloudflare-kv-storage], [Deno][deno-kv-storage] and browsers.
- 🆗 [__Response Creators__][response-creators] --- Factory functions for responses with pre-filled status and status text
- 🎏 [__Stream Response__][stream-response] --- Use async generators to build streaming responses for SSE, etc...
- 🥏 [__JSON Fetch__][json-fetch] --- Drop-in replacements for Fetch API classes with first class support for JSON.
- 🦑 [__JSON Stream__][json-stream] --- Streaming JSON parser/stingifier with first class support for web streams.

Worker Tools also includes a number of polyfills that help bridge the gap between Worker Runtimes:
- ✏️ [__HTML Rewriter__][html-rewriter] --- Cloudflare's HTML Rewriter for use in Deno, browsers, etc...
- 📍 [__Location Polyfill__][location-polyfill] --- A `Location` polyfill for Cloudflare Workers.
- 🦕 [__Deno Fetch Event Adapter__][deno-fetch-event-adapter] --- Dispatches global `fetch` events using Deno’s native HTTP server.

[router]: https://workers.tools/router
[middleware]: https://workers.tools/middleware
[html]: https://workers.tools/html
[kv-storage]: https://workers.tools/kv-storage
[cloudflare-kv-storage]: https://workers.tools/cloudflare-kv-storage
[deno-kv-storage]: https://workers.tools/deno-kv-storage
[kv-storage-polyfill]: https://workers.tools/kv-storage-polyfill
[response-creators]: https://workers.tools/response-creators
[stream-response]: https://workers.tools/stream-response
[json-fetch]: https://workers.tools/json-fetch
[json-stream]: https://workers.tools/json-stream
[request-cookie-store]: https://workers.tools/request-cookie-store
[extendable-promise]: https://workers.tools/extendable-promise
[html-rewriter]: https://workers.tools/html-rewriter
[location-polyfill]: https://workers.tools/location-polyfill
[deno-fetch-event-adapter]: https://workers.tools/deno-fetch-event-adapter

Fore more visit [workers.tools](https://workers.tools).
