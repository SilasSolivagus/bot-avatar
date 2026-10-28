import { describe, expect, it } from "vitest";
import { avatarAssignableLooks, buildGeometry } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { balance, distinctness, lookCounts, wallIdentities } from "../src/metrics.js";

const looks = avatarAssignableLooks(organicBlob.shapes);
/** The wall holds geometry now; these metrics only read its `look`. */
const avatarsOf = (ids: readonly string[]) => ids.map((id) => buildGeometry(organicBlob, id));

describe("lookCounts and balance", () => {
  it("balances 40 generated identities within the pigeonhole bound", () => {
    const avatars = avatarsOf(wallIdentities(organicBlob, 40));
    const counts = lookCounts(avatars);
    expect(counts.size).toBe(looks.length);
    const result = balance(avatars, looks);
    expect(result.ok).toBe(true);
    expect(result.max).toBeLessThanOrEqual(result.allowed);
    expect(result.missing).toEqual([]);
    expect(result.reserved).toBe(0);
  });

  it("rejects an unbalanced set", () => {
    // One identity repeated: a single look, so most assignable looks are missing.
    const avatars = avatarsOf(Array.from({ length: 12 }, () => "alice"));
    expect(balance(avatars, looks).ok).toBe(false);
  });

  it("counts a reserved identity without counting it in the assignable balance", () => {
    const avatars = avatarsOf([...wallIdentities(organicBlob, looks.length), "dave"]);
    expect(avatars.at(-1)?.look).toBe(6);
    expect(balance(avatars, looks)).toMatchObject({
      ok: true,
      max: 1,
      allowed: 1,
      missing: [],
      reserved: 1,
    });
  });

  it("stays balanced when several identities wear the reserved look", () => {
    const avatars = avatarsOf([...wallIdentities(organicBlob, looks.length), "dave", "oscar", "tom"]);
    expect(avatars.filter((avatar) => avatar.look === 6)).toHaveLength(3);
    expect(balance(avatars, looks)).toMatchObject({
      ok: true,
      max: 1,
      allowed: 1,
      missing: [],
      reserved: 3,
    });
  });
});

describe("distinctness", () => {
  it("finds one distinct look per assignable look", () => {
    const ids = wallIdentities(organicBlob, looks.length);
    const result = distinctness(avatarsOf(ids));
    expect(result.distinct).toBe(looks.length);
    expect(result.rate).toBe(0);
  });

  it("reports duplicates honestly", () => {
    const result = distinctness(avatarsOf(Array.from({ length: 9 }, () => "alice")));
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
