# JSON Stream

Utilities for working with streaming JSON in Worker Environments such as Cloudflare Workers, Deno Deploy and Service Workers.

***

__Work in Progress__: Anything might change

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

It's important to add a `.*` at the end, but the `$` can be omitted. 

`JSONParseStream` only supports a subset of JSONPath, specifically eval (`@`) expressions and negative slices are not supported.

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

<!-- (The JSONPath argument can also be used to receive every parsed value as they arrive by using `$..*`) -->

## Retrieving multiple values and collections
By providing a JSON Path to the constructor we can retrieve the values of a single, nested array. 
However, in the example above we lose access to the `type` property. We would also have trouble with more than one array.
For these scenarios theres the `JSONParseWritable` class that provides `promise` and `iterable`/`stream` methods to return one or multiple values respectively. 
It's best to explain by example. Assuming the data structure from above, we have:

```js
const jsonStream = new JSONParseWritable();
const asyncData = {
  type: jsonStream.promise('$.type'),
  items: jsonStream.stream('$.items.*'),
}
(await fetch('/nested.json').body)
  .pipeTo(jsonStream)  // <-- new

assertEquals(await asyncData.type, 'foo')

// We can collect the values as before:
const collected = [];
await asyncData.items
  .pipeTo(new WritableStream({ write(obj) { collected.push(obj) }}))
```

Note that there are many pitfalls with this feature. 
Internally, `.stream` and `.iterable` tee the object stream and filter for the requested JSON paths. 
This means memory usage can grow arbitrary large if the values aren't consumed in the same order as they arrive 
(TODO: actually, the queue grows large the main .readable isn't consumed. Could fix with some trickery. Maybe last call to `stream` doesn't tee the value?)

~~Note that `.promise` by itself does not pull values from the stream. If it isn't combined with `pipeTo` or similar, it will never resolve.~~
~~If it is awaited before sufficient values have been pulled form the stream it will never resolve!~~

Note that the promise might resolve with `undefined` if the corresponding JSON path is not found in the stream.

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
    // Can have arbitrary pauses:
    await timeout(100) 
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

## Limitations
**JSON Stream** largely consists of old Node libraries that have been modified to work in Worker Environments and the browser. Currently they are not "integrated", for example specifying a specific JSON Path does not limit the amount of parsing the parser does.


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
