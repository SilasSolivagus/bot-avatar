import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const upstream = process.env.UPSTREAM_DIR;
if (!upstream) throw new Error("set UPSTREAM_DIR to a rakazo checkout");

const commit = execFileSync("git", ["-C", upstream, "rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

const core = await import(
  pathToFileURL(join(upstream, "packages/core/src/avatar-shape.ts")).href
);

const identities = [
  ...Array.from({ length: 100 }, (_, index) => `fixture-${index}`),
  ...Array.from({ length: 10 }, (_, family) => core.organicAvatarSampleIdentity(family)),
];

const rows = identities.map((identity) => {
  const seed = core.avatarIdentitySeed(identity);
  const family = core.organicAvatarFamily(identity);
  return {
    identity,
    seed,
    family,
    look: core.organicAvatarLook(family),
    path: core.organicAvatarPath(seed),
  };
});

const out = join(dirname(fileURLToPath(import.meta.url)), "fixtures/upstream.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ source: "rakazo", commit, rows }, null, 0)}\n`);

console.log(`recorded ${rows.length} rows from ${commit} -> ${out}`);
