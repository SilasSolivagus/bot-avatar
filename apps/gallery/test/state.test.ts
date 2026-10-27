import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "@botavatar/svg";
import { describe, expect, it } from "vitest";

// Placeholder: Task 2 replaces this file with the URL-state tests.
describe("gallery scaffold", () => {
  it("renders the library avatar to a 160px svg string", () => {
    const svg = renderSvg(buildAvatarSpec(organicBlob, "alice"), { size: 160 });
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="160"');
    expect(svg).toContain('height="160"');
  });
});
