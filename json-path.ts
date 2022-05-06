// deno-lint-ignore-file no-explicit-any

// Modernized version of Stefan Goessner's original JSON Path implementation.
// Copyright (c) 2007 Stefan Goessner (goessner.net)
// Licensed under the MIT (MIT-LICENSE.txt) licence.

export function* trace<T = any>(expr: string, val: unknown, path: string): IterableIterator<[string, T]> {
  if (expr) {
    const [loc, ...rest] = expr.split(";");
    const x = rest.join(";");

    if (val !== null && typeof val === 'object' && loc in val) {
      yield* trace(x, (<any>val)[loc], path + ";" + loc);
    } 
    else if (loc === "*") {
      for (const [m, _l, v, p] of walk(loc, val, path)) {
        yield* trace(m + ";" + x, v, p)
      }
    } 
    else if (loc === "..") {
      yield* trace(x, val, path);
      for (const [m, _l, v, p] of walk(loc, val, path)) {
        if (typeof (<any>v)[m] === "object") 
          yield* trace("..;" + x, (<any>v)[m], p + ";" + m);
      }
    }
    else if (/,/.test(loc)) { // [name1,name2,...]
      for (let s = loc.split(/'?,'?/), i = 0, n = s.length; i < n; i++)
        yield* trace(s[i] + ";" + x, val, path);
    }
    else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) { // [start:end:step] slice syntax
      yield* slice(loc, x, val, path);
    }
  }
  else yield [path, val as T]
}

function* slice<T>(loc: string, expr: string, val: unknown, path: string): IterableIterator<[string, T]> {
  if (val instanceof Array) {
    const len = val.length;
    let start = 0, end = len, step = 1;
    loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, (_$0, $1, $2, $3) => { 
      start = parseInt($1 || start); 
      end = parseInt($2 || end); 
      step = parseInt($3 || step); 
      return '' 
    });
    start = (start < 0) ? Math.max(0, start + len) : Math.min(len, start);
    end = (end < 0) ? Math.max(0, end + len) : Math.min(len, end);
    for (let i = start; i < end; i += step)
      yield* trace(i + ";" + expr, val, path);
  }
}

function* walk(loc: string, val: unknown, path: string) {
    if (val instanceof Array) {
      for (let i = 0, n = val.length; i < n; i++)
          if (i in val)
            yield [i, loc, val, path] as const
    }
    else if (typeof val === "object") {
      for (const m in val)
          if (val.hasOwnProperty(m))
            yield [m, loc, val, path] as const
    }
}

export function normalize(expr: string) {
  const subX: string[] = [];
  if (!expr.startsWith('$')) expr = '$' + expr
  return expr
    .replace(/[\['](\??\(.*?\))[\]']/g, (_$0, $1) => { return "[#" + (subX.push($1) - 1) + "]"; })
    .replace(/'?\.'?|\['?/g, ";")
    .replace(/;;;|;;/g, ";..;")
    .replace(/;$|'?\]|'$/g, "")
    .replace(/#([0-9]+)/g, (_$0, $1) => { return subX[$1]; });
}

// FIXME: avoid repeated split/join/regex.test
export function match(expr: string, path: string): boolean {
  if (expr && path) {
    const [loc, ...restLoc] = expr.split(";");
    const [val, ...restVal] = path.split(";");
    const exprRest = restLoc.join(";");
    const pathRest = restVal.join(';')

    if (loc === val) {
      return match(exprRest, pathRest)
    } 
    else if (loc === "*") {
      return match(exprRest, pathRest)
    } 
    else if (loc === "..") {
      return match(exprRest, path) || match("..;" + exprRest, pathRest);
    }
    else if (/,/.test(loc)) { // [name1,name2,...]
      if (loc.split(/'?,'?/).some(v => v === val)) return match(exprRest, pathRest)
      else return false
    }
    else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) { // [start:end:step] slice syntax
      let start = 0, end = Number.MAX_SAFE_INTEGER, step = 1;
      loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, (_$0, $1, $2, $3) => { 
        start = parseInt($1 || start); 
        end = parseInt($2 || end); 
        step = parseInt($3 || step); 
        return '' 
      });
      const idx = Number(val)
      if (start < 0 || end < 0 || step < 0) 
        throw TypeError('Negative numbers not supported. Can\'t know length ahead of time when stream parsing');
      if (idx >= start && idx < end && start + idx % step === 0) return match(exprRest, pathRest)
      else return false
    }
  } 
  else if (!expr && !path) return true
  return false;
}
