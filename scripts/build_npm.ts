#!/usr/bin/env -S deno run --allow-read --allow-write=./,/Users/qwtel/Library/Caches/deno --allow-net --allow-env=HOME,DENO_AUTH_TOKENS,DENO_DIR --allow-run=git,pnpm
// deno-lint-ignore-file no-unused-vars

// ex. scripts/build_npm.ts
import { basename, extname } from "https://deno.land/std@0.133.0/path/mod.ts";
import { build, emptyDir } from "https://deno.land/x/dnt/mod.ts";

import { 
  latestVersion, copyMdFiles, getDescription, getGHTopics, getGHLicense, getGHHomepage,
} from 'https://gist.githubusercontent.com/qwtel/ecf0c3ba7069a127b3d144afc06952f5/raw/latest-version.ts'

await emptyDir("./npm");

const name = basename(Deno.cwd())

await build({
  entryPoints: ["./index.ts"],
  outDir: "./npm",
  shims: {},
  test: false,
  package: {
    // package.json properties
    name: `@worker-tools/${name}`,
    version: await latestVersion(),
    description: await getDescription(),
    license: await getGHLicense(name) ?? 'MIT',
    publishConfig: {
      access: "public"
    },
    author: "Florian Klampfer <mail@qwtel.com> (https://qwtel.com/)",
    repository: {
      type: "git",
      url: `git+https://github.com/worker-tools/${name}.git`,
    },
    bugs: {
      url: `https://github.com/worker-tools/${name}/issues`,
    },
    homepage: await getGHHomepage(name) ?? `https://github.com/worker-tools/${name}#readme`,
    keywords: await getGHTopics(name) ?? [],
  },
  mappings: {
    'https://cdn.skypack.dev/ts-functional-pipe@3.1.2': {
      name: 'ts-functional-pipe',
      version: '3.1.2',
    },
    'https://ghuc.cc/worker-tools/resolvable-promise/index.ts': {
      name: '@worker-tools/resolvable-promise',
      version: 'latest',
    },
    'https://ghuc.cc/worker-tools/stream-response/index.ts': {
      name: '@worker-tools/stream-response',
      version: 'latest',
    },
    'https://ghuc.cc/qwtel/whatwg-stream-to-async-iter/index.ts': {
      name: 'whatwg-stream-to-async-iter',
      version: 'latest',
    },
  },
  packageManager: 'pnpm',
  compilerOptions: {
    sourceMap: true,
    target: 'ES2019'
  },
});

// post build steps
await copyMdFiles();
