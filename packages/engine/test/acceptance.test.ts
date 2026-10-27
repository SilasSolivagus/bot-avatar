import { describe, expect, it } from "vitest";
import { buildAvatarSpec } from "../src/spec.js";
import { organicBlob } from "../../style-packs/organic-blob/src/index.js";
import { avatarAssignableLooks } from "../src/family.js";

const identities = Array.from({ length: 1000 }, (_, index) => `account-${index * 7919}-bot`);

describe("distribution over 1000 identities", () => {
  it("spreads families within 20% of uniform", () => {
    const counts = new Array(organicBlob.shapes.length).fill(0);
    for (const identity of identities) counts[buildAvatarSpec(organicBlob, identity).family]++;
    const expected = identities.length / organicBlob.shapes.length;
    for (const count of counts) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it("keeps the reserved family out of the assignment pool", () => {
    expect(avatarAssignableLooks(organicBlob.shapes)).not.toContain(6);
    // The hash may still land on the reserved family; only assignment excludes it.
    const reserved = identities.filter(
      (identity) => buildAvatarSpec(organicBlob, identity).family === 6,
    );
    expect(reserved.length).toBeGreaterThan(0);
  });

  it("keeps the output small enough to cache", () => {
    const spec = buildAvatarSpec(organicBlob, identities[0]!);
    expect(JSON.stringify(spec).length).toBeLessThan(8000);
  });
});
