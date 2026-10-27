import { describe, expect, it } from "vitest";
import {
  addWallIdentity,
  formatWallState,
  MAX_IDS,
  parseWallState,
} from "../src/state.js";

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

  it("reads one id= parameter per identity", () => {
    expect(parseWallState("?pack=clay&id=x&id=y&size=96", PACKS, IDS)).toEqual({
      pack: "clay",
      ids: ["x", "y"],
      size: 96,
    });
  });

  it("prefers id= over a legacy ids= list", () => {
    expect(parseWallState("?id=new&ids=old,legacy", PACKS, IDS).ids).toEqual(["new"]);
  });

  it("replaces an unknown pack with the first known one", () => {
    expect(parseWallState("?pack=nope", PACKS, IDS).pack).toBe("organic-blob");
  });

  it("trims, drops empties and de-duplicates a legacy ids list", () => {
    expect(parseWallState("?ids=%20a%20,,a,b,,", PACKS, IDS).ids).toEqual(["a", "b"]);
  });

  it("still parses a legacy ?ids=a,b link as two identities", () => {
    expect(parseWallState("?ids=a,b", PACKS, IDS).ids).toEqual(["a", "b"]);
  });

  it("preserves a comma inside an id= parameter", () => {
    expect(parseWallState("?id=a%2Cb", PACKS, IDS).ids).toEqual(["a,b"]);
  });

  it("preserves edge whitespace from id= and does not trim it", () => {
    expect(parseWallState("?id=%20c%20", PACKS, IDS).ids).toEqual([" c "]);
  });

  it("de-duplicates ids after decoding them", () => {
    expect(parseWallState("?id=a%2Cb&id=a%2Cb&id=c", PACKS, IDS).ids).toEqual(["a,b", "c"]);
  });

  it("caps a decoded id list at 60", () => {
    const many = Array.from({ length: 80 }, (_, index) => `id=${index}`).join("&");
    expect(parseWallState(`?${many}&id=0`, PACKS, IDS).ids).toHaveLength(MAX_IDS);
  });

  it("caps a legacy ids list at 60", () => {
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

  it("round-trips a single id through parse", () => {
    const state = { pack: "clay", ids: ["alice"], size: 160 };
    expect(parseWallState(formatWallState(state), PACKS, IDS)).toEqual(state);
  });

  it("round-trips a comma inside an identity", () => {
    const state = { pack: "organic-blob", ids: ["a,b"], size: 160 };
    const formatted = formatWallState(state);
    expect(formatted).toContain("id=a%2Cb");
    expect(parseWallState(formatted, PACKS, IDS).ids).toEqual(["a,b"]);
  });

  it("round-trips edge whitespace inside an identity", () => {
    const state = { pack: "organic-blob", ids: [" c "], size: 160 };
    const formatted = formatWallState(state);
    expect(formatted).toContain("id=%20c%20");
    expect(parseWallState(formatted, PACKS, IDS).ids).toEqual([" c "]);
  });

  it("separates every identity into its own id= parameter", () => {
    const state = { pack: "organic-blob", ids: ["a,b", " c ", "d"], size: 160 };
    const formatted = formatWallState(state);
    expect(formatted.match(/id=/g)).toHaveLength(3);
    expect(parseWallState(formatted, PACKS, IDS).ids).toEqual(["a,b", " c ", "d"]);
  });

  it("encodes ids that need it", () => {
    const state = { pack: "organic-blob", ids: ["a b", "c@d"], size: 160 };
    expect(formatWallState(state)).toContain("a%20b");
    expect(parseWallState(formatWallState(state), PACKS, IDS).ids).toEqual(["a b", "c@d"]);
  });
});

describe("addWallIdentity", () => {
  it("appends an identity below the cap", () => {
    expect(addWallIdentity(["a"], "b")).toEqual({ outcome: "added", ids: ["a", "b"] });
  });

  it("reports a duplicate without changing the wall", () => {
    expect(addWallIdentity(["a", "b"], "a")).toEqual({ outcome: "duplicate", ids: ["a", "b"] });
  });

  it("adds the 60th identity when the wall is one below the cap", () => {
    const ids = Array.from({ length: MAX_IDS - 1 }, (_, index) => `id-${index}`);
    const result = addWallIdentity(ids, "last");
    expect(result.outcome).toBe("added");
    expect(result.ids).toHaveLength(MAX_IDS);
  });

  it("refuses to add at the cap and leaves the wall unchanged", () => {
    const ids = Array.from({ length: MAX_IDS }, (_, index) => `id-${index}`);
    expect(addWallIdentity(ids, "one-too-many")).toEqual({ outcome: "full", ids });
  });
});
