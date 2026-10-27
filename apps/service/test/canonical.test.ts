import { describe, expect, it } from "vitest";
import { canonicalJson, CanonicalError } from "../src/canonical.js";

describe("canonicalJson", () => {
  it("sorts keys at every depth", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("keeps array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("is insensitive to insertion order", () => {
    const a = { id: "x", palette: [{ light: "#fff", dark: "#000" }] };
    const b = { palette: [{ dark: "#000", light: "#fff" }], id: "x" };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("refuses values JSON cannot represent", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow(CanonicalError);
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(CanonicalError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(CanonicalError);
    expect(() => canonicalJson({ a: () => 1 })).toThrow(CanonicalError);
  });

  it("refuses a cycle instead of hanging", () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => canonicalJson(loop)).toThrow(CanonicalError);
  });

  it("refuses undefined inside an array rather than emitting null", () => {
    const sparse = [1, undefined, 3];
    expect(() => canonicalJson(sparse)).toThrow(CanonicalError);
  });

  it("refuses array holes rather than emitting invalid JSON", () => {
    const holes: number[] = [];
    holes[1] = 2;
    expect(() => canonicalJson(holes)).toThrow(CanonicalError);
  });

  it("refuses symbols, bigints and negative infinity", () => {
    expect(() => canonicalJson({ a: Symbol("x") })).toThrow(CanonicalError);
    expect(() => canonicalJson({ a: 1n })).toThrow(CanonicalError);
    expect(() => canonicalJson({ a: Number.NEGATIVE_INFINITY })).toThrow(CanonicalError);
  });

  it("serialises negative zero the way JSON does", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson({ a: -0 })).toBe('{"a":0}');
  });

  it("round-trips plain JSON values", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson({ a: [1, { z: null }] })).toBe('{"a":[1,{"z":null}]}');
  });
});
