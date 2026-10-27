import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

const script = `
import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "@botavatar/svg";
process.stdout.write(renderSvg(buildAvatarSpec(organicBlob, "bot_123"), { size: 96 }));
`;

function renderInFreshProcess(): string {
  return execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("cross-process determinism", () => {
  it("produces the same svg in two separate node processes", () => {
    expect(renderInFreshProcess()).toBe(renderInFreshProcess());
  });
});
