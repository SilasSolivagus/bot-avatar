import { describe, expect, it } from "vitest";
import { avatarTag, matchesIfNoneMatch, packHeader } from "../src/tag.js";

const base = {
  packHash: "a".repeat(64),
  identity: "alice",
  size: 128,
  state: "idle",
  renderBuild: "0123456789abcdef",
};
const packHash = "f".repeat(64);

describe("avatarTag", () => {
  it("is a quoted 16 hex string", () => {
    expect(avatarTag(base)).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it("never contains the pack hash, the identity, the size or the state", () => {
    const tag = avatarTag({
      packHash,
      identity: "alice@example.com",
      size: 1024,
      state: "working",
      renderBuild: base.renderBuild,
    });
    expect(tag).not.toContain(packHash);
    expect(tag).not.toContain("alice");
    expect(tag).not.toContain("1024");
    expect(tag).not.toContain("working");
  });

  it("changes with every input", () => {
    const tag = avatarTag(base);
    expect(avatarTag({ ...base, identity: "bob" })).not.toBe(tag);
    expect(avatarTag({ ...base, size: 64 })).not.toBe(tag);
    expect(avatarTag({ ...base, state: "working" })).not.toBe(tag);
    expect(avatarTag({ ...base, surface: "#0b0b0c" })).not.toBe(tag);
    expect(avatarTag({ ...base, packHash: "b".repeat(64) })).not.toBe(tag);
  });
});

describe("render build in the tag", () => {
  it("changes when the renderer build changes", () => {
    expect(avatarTag({ ...base, renderBuild: "fedcba9876543210" })).not.toBe(avatarTag(base));
  });

  it("stays a quoted 16 hex string", () => {
    expect(avatarTag(base)).toMatch(/^"[0-9a-f]{16}"$/);
  });

  it("still separates the representation kinds at one build", () => {
    const tags = (["svg", "json", "png"] as const).map((kind) => avatarTag({ ...base, kind }));
    expect(new Set(tags).size).toBe(3);
  });
});

describe("matchesIfNoneMatch", () => {
  const tag = avatarTag(base);

  it("matches exactly, in a list, with a wildcard and with a weak prefix", () => {
    expect(matchesIfNoneMatch(tag, tag)).toBe(true);
    expect(matchesIfNoneMatch(`"other", ${tag}`, tag)).toBe(true);
    expect(matchesIfNoneMatch("*", tag)).toBe(true);
    expect(matchesIfNoneMatch(`W/${tag}`, tag)).toBe(true);
  });

  it("tolerates whitespace around the header and its list entries", () => {
    expect(matchesIfNoneMatch(`  ${tag}  `, tag)).toBe(true);
    expect(matchesIfNoneMatch(`"other" ,  ${tag}`, tag)).toBe(true);
  });

  it("does not match a different tag", () => {
    expect(matchesIfNoneMatch('"0000000000000000"', tag)).toBe(false);
    expect(matchesIfNoneMatch(undefined, tag)).toBe(false);
    expect(matchesIfNoneMatch("", tag)).toBe(false);
  });

  it("does not treat a wildcard mixed into a list as the wildcard", () => {
    expect(matchesIfNoneMatch(`"other", *`, tag)).toBe(false);
  });
});

describe("packHeader", () => {
  it("is id@version and nothing else", () => {
    expect(packHeader({ id: "organic-blob", version: "1.0.0" } as never)).toBe("organic-blob@1.0.0");
  });
});
