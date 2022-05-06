// Modified version of maxogden/binary-split
// Copyright (c) 2016 Max Ogden
// Licensed under the BSD-2-Clause license

// TODO: Move to separate module

import { concatUint8Arrays } from 'https://ghuc.cc/qwtel/typed-array-utils/index.ts';

const mkFirstMatch = (matcher: Uint8Array) => (buf: Uint8Array, offset: number) => {
  if (offset >= buf.length) return -1
  let i
  for (i = offset; i < buf.length; i++) {
    if (buf[i] === matcher[0]) {
      if (matcher.length > 1) {
        let fullMatch = true
        let j, k;
        for (j = i, k = 0; j < i + matcher.length; j++, k++) {
          if (buf[j] !== matcher[k]) {
            fullMatch = false
            break
          }
        }
        if (fullMatch) return j - matcher.length
      } else {
        break
      }
    }
  }

  const idx = i + matcher.length - 1
  return idx
}

const NL = new Uint8Array([10]) // new TextEncoder().encode('\n');

export class BinarySplitStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(splitOn: string | Uint8Array = NL) {
    const matcher = typeof splitOn === 'string' 
      ? new TextEncoder().encode(splitOn) 
      : splitOn;
    let offset = 0;
    let lastMatch = 0;
    let buffered: Uint8Array | undefined
    let firstMatch: ReturnType<typeof mkFirstMatch>;
    super({
      start() {
        offset = 0;
        lastMatch = 0;
        buffered = undefined;
        firstMatch = mkFirstMatch(matcher)
      },
      transform(chunk, controller) {
        let buf: Uint8Array
        if (buffered) {
          buf = concatUint8Arrays(buffered, chunk)
          offset = buffered.byteLength
          buffered = undefined
        } else {
          buf = chunk
        }

        while (true) {
          const idx = firstMatch(buf, offset - matcher.byteLength + 1)
          if (idx !== -1 && idx < buf.byteLength) {
            controller.enqueue(buf.subarray(lastMatch, idx))
            offset = idx + matcher.byteLength
            lastMatch = offset
          } else {
            buffered = buf.subarray(lastMatch)
            break
          }
        }
      },
      flush(controller) {
        if (buffered) controller.enqueue(buffered)
      },
    })
  }
}

export class SplitStream extends TransformStream<string, string> {
  constructor(splitOn: string | RegExp = /\r?\n/) {
    const matcher = typeof splitOn === 'string' 
      ? new RegExp(splitOn)
      : splitOn;
    let offset = 0;
    let lastMatch = 0;
    let lastLen = 0;
    let buffered: string | undefined
    let firstMatch: (buf: string, offset: number) => [number, number];
    super({
      start() {
        offset = 0;
        lastMatch = 0;
        lastLen = 0;
        buffered = undefined;
        firstMatch = (buf, offset) => {
          const match = matcher.exec(buf.substring(offset))
          return match ? [match.index, match[0].length] : [-1, 0]
        }
      },
      transform(chunk, controller) {
        let buf: string
        if (buffered) {
          buf = buffered + chunk
          offset = buffered.length
          buffered = undefined
        } else {
          buf = chunk
        }

        while (true) {
          const [idx, len] = firstMatch(buf, offset - lastLen + 1)
          if (idx !== -1 && idx < buf.length) {
            controller.enqueue(buf.substring(lastMatch, idx))
            offset = idx + len
            lastMatch = offset
            lastLen = len
          } else {
            buffered = buf.substring(lastMatch)
            break
          }
        }
      },
      flush(controller) {
        if (buffered) controller.enqueue(buffered)
      },
    })
  }
}
