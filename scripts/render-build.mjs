#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBuildFingerprint } from "./render-build-lib.mjs";

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const root = resolve(process.argv[2] ?? process.cwd());
  process.stdout.write(`${renderBuildFingerprint(root)}\n`);
}
