import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface FixtureRow {
  identity: string;
  seed: number;
  family: number;
  look: number;
  path: string;
}

const file = fileURLToPath(new URL("../../../parity/fixtures/upstream.json", import.meta.url));
const fixture = JSON.parse(readFileSync(file, "utf8")) as { commit: string; rows: FixtureRow[] };

export const fixtureRows = fixture.rows;
