import { describe, expect, it } from "vitest";
import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { avatarAssignableLooks } from "@botavatar/engine";
import { balance, distinctness, lookCounts, wallIdentities } from "../src/metrics.js";

const looks = avatarAssignableLooks(organicBlob.shapes);
const specsOf = (ids: readonly string[]) => ids.map((id) => buildAvatarSpec(organicBlob, id));

describe("lookCounts and balance", () => {
  it("balances 40 generated identities within the pigeonhole bound", () => {
    const specs = specsOf(wallIdentities(organicBlob, 40));
    const counts = lookCounts(specs);
    expect(counts.size).toBe(looks.length);
    const result = balance(specs, looks);
    expect(result.ok).toBe(true);
    expect(result.max).toBeLessThanOrEqual(result.allowed);
    expect(result.missing).toEqual([]);
  });

  it("rejects an unbalanced set", () => {
    // One identity repeated: a single look, so most assignable looks are missing.
    const specs = specsOf(Array.from({ length: 12 }, () => "alice"));
    expect(balance(specs, looks).ok).toBe(false);
  });
});

describe("distinctness", () => {
  it("finds one distinct look per assignable look", () => {
    const ids = wallIdentities(organicBlob, looks.length);
    const result = distinctness(specsOf(ids));
    expect(result.distinct).toBe(looks.length);
    expect(result.rate).toBe(0);
  });

  it("reports duplicates honestly", () => {
    const result = distinctness(specsOf(Array.from({ length: 9 }, () => "alice")));
    expect(result.distinct).toBe(1);
    expect(result.rate).toBeCloseTo(8 / 9, 5);
  });
});

describe("wallIdentities", () => {
  it("is deterministic", () => {
    expect(wallIdentities(organicBlob, 12)).toEqual(wallIdentities(organicBlob, 12));
  });

  it("returns the requested count of unique ids", () => {
    const ids = wallIdentities(organicBlob, 40);
    expect(ids).toHaveLength(40);
    expect(new Set(ids).size).toBe(40);
  });
});
