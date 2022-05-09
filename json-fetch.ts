// deno-lint-ignore-file no-explicit-any
import { StreamResponse, StreamRequest } from "https://ghuc.cc/worker-tools/stream-response/index.ts";
import { JSONStringifyReadable } from './json-stringify.ts';

export type JSONStreamBodyInit = any 
export type JSONStreamRequestInit = Omit<RequestInit, 'body'> & { body?: JSONStreamBodyInit }

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

    const body = new JSONStringifyReadable(_body)

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

    const _body = new JSONStringifyReadable(body)

    const headers = new Headers(_headers);

    if (!headers.has('Content-Type') && body != null)
      headers.set('Content-Type', JSONStreamResponse.contentType);

    super(_body, { headers, ...rest });
  }
}

export type {
  JSONStreamRequest as JSONRequest,
  JSONStreamResponse as JSONResponse,
}