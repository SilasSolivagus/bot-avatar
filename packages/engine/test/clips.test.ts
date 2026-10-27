import { describe, expect, it } from "vitest";
import { CLIP_NAMES, clipFrame } from "../src/clips.js";

const REST = { translateY: 0, scale: 1, rotate: 0, eyeScaleY: 1, eyeOffsetX: 0 };

describe("clipFrame", () => {
  it("is at rest at both ends of the loop, for every clip", () => {
    for (const clip of CLIP_NAMES) {
      expect(clipFrame(clip, 0, 1)).toEqual(REST);
    }
  });

  it("returns to rest at the top of the loop", () => {
    for (const clip of CLIP_NAMES) {
      const frame = clipFrame(clip, 0.999999, 1);
      expect(Math.abs(frame.translateY)).toBeLessThan(0.5);
      expect(Math.abs(frame.scale - 1)).toBeLessThan(0.05);
      expect(Math.abs(frame.rotate)).toBeLessThan(0.5);
    }
  });

  it("moves the body channels at the midpoint", () => {
    expect(clipFrame("breathe", 0.5, 1).scale).toBeGreaterThan(1);
    expect(clipFrame("bob", 0.5, 1).translateY).not.toBe(0);
    expect(clipFrame("sway", 0.5, 1).rotate).not.toBe(0);
    expect(clipFrame("tilt", 0.5, 1).rotate).not.toBe(0);
    expect(clipFrame("shake", 0.25, 1).translateY).not.toBe(0);
  });

  it("squashes on landing in bounce", () => {
    const air = clipFrame("bounce", 0.5, 1);
    const land = clipFrame("bounce", 0.75, 1);
    expect(air.translateY).toBeLessThan(0);
    expect(land.scale).toBeLessThan(1);
  });

  it("leaves the body at rest for the eye-only clips", () => {
    for (const clip of ["blink", "look-round"] as const) {
      for (const progress of [0.1, 0.25, 0.5, 0.75]) {
        const frame = clipFrame(clip, progress, 1);
        expect(frame.translateY).toBe(0);
        expect(frame.scale).toBe(1);
        expect(frame.rotate).toBe(0);
      }
    }
  });

  it("closes the eyes at the midpoint of blink and opens them at the ends", () => {
    expect(clipFrame("blink", 0.5, 1).eyeScaleY).toBeLessThan(0.2);
    expect(clipFrame("blink", 0, 1).eyeScaleY).toBe(1);
    expect(clipFrame("blink", 0.5, 1).eyeOffsetX).toBe(0);
  });

  it("looks right then left in look-round", () => {
    expect(clipFrame("look-round", 0.25, 1).eyeOffsetX).toBeGreaterThan(2);
    expect(clipFrame("look-round", 0.75, 1).eyeOffsetX).toBeLessThan(-2);
    expect(clipFrame("look-round", 0.5, 1).eyeOffsetX).toBeCloseTo(0, 5);
    expect(clipFrame("look-round", 0.25, 1).eyeScaleY).toBe(1);
  });

  it("scales every channel with amplitude", () => {
    const half = clipFrame("sway", 0.5, 0.5);
    const full = clipFrame("sway", 0.5, 1);
    expect(Math.abs(full.rotate)).toBeGreaterThan(Math.abs(half.rotate));
    expect(clipFrame("blink", 0.5, 2).eyeScaleY).toBeLessThan(clipFrame("blink", 0.5, 1).eyeScaleY);
    expect(Math.abs(clipFrame("look-round", 0.25, 2).eyeOffsetX)).toBeGreaterThan(
      Math.abs(clipFrame("look-round", 0.25, 1).eyeOffsetX),
    );
  });

  it("stays bounded whatever the progress", () => {
    for (const clip of CLIP_NAMES) {
      for (let step = 0; step < 100; step++) {
        const frame = clipFrame(clip, step / 100, 1);
        expect(Math.abs(frame.translateY)).toBeLessThanOrEqual(6);
        expect(Math.abs(frame.scale - 1)).toBeLessThanOrEqual(0.12);
        expect(Math.abs(frame.rotate)).toBeLessThanOrEqual(8);
        expect(frame.eyeScaleY).toBeGreaterThanOrEqual(0);
        expect(frame.eyeScaleY).toBeLessThanOrEqual(1);
        expect(Math.abs(frame.eyeOffsetX)).toBeLessThanOrEqual(8);
      }
    }
  });
});
