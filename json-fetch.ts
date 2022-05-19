// deno-lint-ignore-file no-explicit-any
import { StreamResponse, StreamRequest } from "https://ghuc.cc/worker-tools/stream-response/index.ts";
import { asyncIterToStream } from 'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts';
import { JSONStringifyReadable, isAsyncIterable } from './json-stringify.ts';

export type JSONStreamBodyInit = ReadableStream<string> | AsyncIterable<string> | any; 
export type JSONStreamRequestInit = Omit<RequestInit, 'body'> & { body?: JSONStreamBodyInit }

const toBody = (x: any) => x instanceof ReadableStream 
  ? x
  : isAsyncIterable(x) 
    ? asyncIterToStream(x)
    : new JSONStringifyReadable(x)

export class JSONStreamRequest extends StreamRequest {
  static contentType = 'application/json;charset=UTF-8';
  static accept = 'application/json, text/plain, */*';

  constructor(
    input: RequestInfo | URL,
    init?: JSONStreamRequestInit,
    // replacer?: Parameters<typeof JSON.stringify>[1],
    // space?: Parameters<typeof JSON.stringify>[2],
  ) {
    const { headers: _headers, body: _body, ...rest } = init || {};

    const body = toBody(_body);

    const headers = new Headers(_headers);
    if (!headers.has('Content-Type') && _body != null)
      headers.set('Content-Type', JSONStreamRequest.contentType);

    if (!headers.has('Accept'))
      headers.set('Accept', JSONStreamRequest.accept);

    super(input instanceof URL ? input.href : input, { headers, body, ...rest });
  }
}

export class JSONStreamResponse extends StreamResponse {
  static contentType = 'application/json;charset=UTF-8';

  constructor(
    body?: JSONStreamBodyInit | null,
    init?: ResponseInit,
    // replacer?: Parameters<typeof JSON.stringify>[1],
    // space?: Parameters<typeof JSON.stringify>[2],
  ) {
    const { headers: _headers, ...rest } = init || {};

    const _body = toBody(body)

    const headers = new Headers(_headers);

    if (!headers.has('Content-Type') && body != null)
      headers.set('Content-Type', JSONStreamResponse.contentType);

    super(_body, { headers, ...rest });
  }
}
