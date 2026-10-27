import type { StylePack } from "@botavatar/engine";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { builtinPacks, loadPack, PackError } from "./packs.js";

export interface Args {
  port: number;
  host: string;
  packs: string[];
}

/** Parses `--port <n>`, `--host <addr>` and repeated `--pack <path>`; rejects anything else. */
export function parseArgs(argv: string[]): Args {
  const args: Args = { port: 8787, host: "127.0.0.1", packs: [] };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--pack") {
      if (!value) throw new Error("--pack needs a path");
      args.packs.push(value);
      index++;
      continue;
    }
    if (flag === "--port" || flag === "--host") {
      if (!value) throw new Error(`${flag} needs a value`);
      if (flag === "--host") args.host = value;
      else {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error(`--port must be an integer 1-65535, got ${value}`);
        }
        args.port = port;
      }
      index++;
      continue;
    }
    throw new Error(`unknown flag ${flag}`);
  }
  return args;
}

/** Loads the built-in packs plus every `--pack`, rejects duplicate ids, then serves. */
export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const loaded: StylePack[] = [];
  for (const path of args.packs) loaded.push(await loadPack(path));
  const packs = [...builtinPacks(), ...loaded];
  const ids = new Set<string>();
  for (const pack of packs) {
    if (ids.has(pack.id)) throw new PackError(`duplicate pack id: ${pack.id}`);
    ids.add(pack.id);
  }

  const app = createApp({ packs, logger: (line) => console.log(line) });
  serve({ fetch: app.fetch, port: args.port, hostname: args.host }, (info) => {
    // `info.port` is the bound port, not necessarily the requested one.
    console.log(`bot-avatar service on http://${args.host}:${info.port} (packs: ${[...ids].join(", ")})`);
  });
}
