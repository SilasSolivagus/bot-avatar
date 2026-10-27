import { describe, expect, it } from "vitest";
import { formatWallState, parseWallState } from "../src/state.js";

const PACKS = ["organic-blob", "clay"];
const IDS = ["a", "b", "c"];

describe("parseWallState", () => {
  it("falls back to the first pack and the fallback ids on an empty search", () => {
    expect(parseWallState("", PACKS, IDS)).toEqual({ pack: "organic-blob", ids: IDS, size: 160 });
  });

  it("reads pack, ids and size", () => {
    expect(parseWallState("?pack=clay&ids=x,y&size=96", PACKS, IDS)).toEqual({
      pack: "clay",
      ids: ["x", "y"],
      size: 96,
    });
  });

  it("replaces an unknown pack with the first known one", () => {
    expect(parseWallState("?pack=nope", PACKS, IDS).pack).toBe("organic-blob");
  });

  it("trims, drops empties and de-duplicates ids", () => {
    expect(parseWallState("?ids=%20a%20,,a,b,,", PACKS, IDS).ids).toEqual(["a", "b"]);
  });

  it("caps the id list at 60", () => {
    const many = Array.from({ length: 80 }, (_, index) => `id-${index}`).join(",");
    expect(parseWallState(`?ids=${many}`, PACKS, IDS).ids).toHaveLength(60);
  });

  it("rejects a size outside 48..512 or a non-number", () => {
    expect(parseWallState("?size=10", PACKS, IDS).size).toBe(160);
    expect(parseWallState("?size=9000", PACKS, IDS).size).toBe(160);
    expect(parseWallState("?size=abc", PACKS, IDS).size).toBe(160);
    expect(parseWallState("?size=48", PACKS, IDS).size).toBe(48);
  });

  it("falls back to the fallback ids when the id list is empty", () => {
    expect(parseWallState("?ids=,,", PACKS, IDS).ids).toEqual(IDS);
  });
});

describe("formatWallState", () => {
  it("round-trips through parse", () => {
    const state = { pack: "clay", ids: ["x", "y"], size: 96 };
    expect(parseWallState(formatWallState(state), PACKS, IDS)).toEqual(state);
  });

  it("encodes ids that need it", () => {
    const state = { pack: "organic-blob", ids: ["a b", "c@d"], size: 160 };
    expect(formatWallState(state)).toContain("a%20b");
    expect(parseWallState(formatWallState(state), PACKS, IDS).ids).toEqual(["a b", "c@d"]);
  });
});
