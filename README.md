# JSON Stream

Utilities for working with streaming JSON in Worker Environments such as Cloudflare Workers, Deno Deploy and Service Workers.

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

If on the other hand ND-JSON is sufficient for your use case, this module also provides `NDJSONStringifyStream` and `NDJSONParseStream` that work the same way as shown above, but lack the following features (TODO: move to separate module?).

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
const ctrl = new JSONParseNexus();
const asyncData = {
  type: ctrl.eager('$.type'),
  items: ctrl.stream('$.items.*'),
}
(await fetch('/nested.json').body)
  .pipeThrough(ctrl)  // <-- new

assertEquals(await asyncData.type, 'foo')

// We can collect the values as before:
const collected = [];
await asyncData.items
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
const ctrl = new JSONParseNexus();

jsonStringifyStream({
  xs: new Array(10_000).fill({ x: 'x' }),
  ys: new Array(10_000).fill({ y: 'y' }),
}).pipeThrough(ctrl)

for await (const y of ctrl.iterable('$.ys.*')) console.log(y)
for await (const x of ctrl.iterable('$.xs.*')) console.log(x)
```

In this examples Ys are being processed before Xs, but were stringified in the opposite order. 
This means the internal queue of Xs grows to 10.000 before it is being processed by the second loop. 
This can be avoided by changing the order to match the stringification order.

### Eager and Lazy Promises
Special attention has to be given single values, as Promises in JS have no concept of "pulling" data. 
`JSONParseNexus` provides two separate methods to request a single value: `.eager` and `.lazy`. 
Both return promises that resolve with the requested value, but they differ in their effect on the internal stream: 
The former starts pulling values from the stream immediately until the requested value is found, 
while the later will only resolve if another consumer advances the parser's cursor beyond the point where the requested value is located. 

Both approaches have their pitfalls.
Requesting a value eager might parse an arbitrary amount of JSON, fill up queues and remove other's consumers ability to control the pace of data. 
Requesting values lazily on the other hand might block execution entirely.

TODO: Find a better solution. Perhaps pull as part of `.then` call??

```js
const ctrl = new JSONParseNexus();

jsonStringifyStream({
  type: 'items',
  items: new Array(10_000).fill({ x: 'x' }),
  trailer: 'trail',
}).pipeThrough(ctrl)

const data = {
  type: ctrl.eager('$.type') // Fine
  items: ctrl.iterable('$.items.*') // Fine
  trailer: ctrl.lazy('$.trailer')
}

const type = await data.type
for await (const x of data.items) console.log(x)
const trailer = await data.trailer.pull()
```

In this example the use of `.eager` has unintended consequences. TBC

<!-- ```js
const ctrl = new JSONParseNexus();

const data = {
  type: ctrl.lazy('$.type') // Fine
  items: ctrl.iterable('$.items.*') // Fine
  trailer: ctrl.lazy('$.trailer') // Oh-Oh
}

jsonStringifyStream({
  type: 'items',
  items: new Array(10_000).fill({ x: 'x' }),
  trailer: 'trail',
}).pipeThrough(ctrl)

const type = await data.type.pull()
for await (const x of data.items) console.log(x)
const trailer = await data.trailer.pull()
``` -->


<!-- Note that there are many pitfalls with this feature. 
~~Internally, `.stream` and `.iterable` tee the object stream and filter for the requested JSON paths.~~
Internally `JSONParseNexus` manages multiple queues that it fills i
This means memory usage can grow arbitrary large if the values aren't consumed in the same order as they arrive 
(TODO: actually, the queue grows large the main .readable isn't consumed. Could fix with some trickery. Maybe last call to `stream` doesn't tee the value?) -->

<!-- ~~Note that `.promise` by itself does not pull values from the stream. If it isn't combined with `pipeTo` or similar, it will never resolve.~~
~~If it is awaited before sufficient values have been pulled form the stream it will never resolve!~~ -->

<!-- Note that the promise might resolve with `undefined` if the corresponding JSON path is not found in the stream. -->


## Limitations
**JSON Stream** largely consists of old Node libraries that have been modified to work in Worker Environments and the browser. 
Currently they are not "integrated", for example specifying a specific JSON Path does not limit the amount of parsing the parser does.


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

## Deno: Stream from Filesystem
When reading JSON from a file system, nothing special is required: 

```js
new Response((await Deno.open('./nested.json')).readable, {
  headers: [['content-type', 'application/json']] 
})
```
