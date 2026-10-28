import { describe, expect, it } from "vitest";
import { FOLLOW_PITCH_MAX, FOLLOW_YAW_MAX, gazeFromPointer } from "../src/pose.js";

/** A square card centred at (200, 200), 200 px on a side: corners are ±100 from centre. */
const CARD = { left: 100, top: 100, width: 200, height: 200 };

describe("gazeFromPointer", () => {
  it("rests at the centre of the card", () => {
    expect(gazeFromPointer(200, 200, CARD)).toEqual({ yaw: 0, pitch: 0 });
  });

  it("turns fully at the edges and pitches fully at the top and bottom", () => {
    expect(gazeFromPointer(100, 200, CARD)).toEqual({ yaw: -FOLLOW_YAW_MAX, pitch: 0 });
    expect(gazeFromPointer(300, 200, CARD)).toEqual({ yaw: FOLLOW_YAW_MAX, pitch: 0 });
    expect(gazeFromPointer(200, 100, CARD)).toEqual({ yaw: 0, pitch: FOLLOW_PITCH_MAX });
    expect(gazeFromPointer(200, 300, CARD)).toEqual({ yaw: 0, pitch: -FOLLOW_PITCH_MAX });
  });

  it("maps the top-left and bottom-right corners to opposite turns and nods", () => {
    // Up is positive pitch: a pointer above the centre makes the gaze look up, and
    // the renderer turns that into an upward nod.
    expect(gazeFromPointer(100, 100, CARD)).toEqual({ yaw: -45, pitch: 25 });
    expect(gazeFromPointer(300, 300, CARD)).toEqual({ yaw: 45, pitch: -25 });
    expect(gazeFromPointer(300, 100, CARD)).toEqual({ yaw: 45, pitch: 25 });
    expect(gazeFromPointer(100, 300, CARD)).toEqual({ yaw: -45, pitch: -25 });
  });

  it("clamps a pointer outside the card to the nearest edge", () => {
    expect(gazeFromPointer(-500, -500, CARD)).toEqual({ yaw: -45, pitch: 25 });
    expect(gazeFromPointer(900, 900, CARD)).toEqual({ yaw: 45, pitch: -25 });
  });

  it("rounds to whole degrees, like the sliders", () => {
    const gaze = gazeFromPointer(200 + 0.004 * 100, 200 - 0.004 * 100, CARD);
    expect(Number.isInteger(gaze.yaw)).toBe(true);
    expect(Number.isInteger(gaze.pitch)).toBe(true);
    expect(gaze).toEqual({ yaw: 0, pitch: 0 });
    expect(Object.is(gaze.yaw, -0)).toBe(false);
  });

  it("survives a zero-sized card instead of dividing by zero", () => {
    const gaze = gazeFromPointer(10, 10, { left: 10, top: 10, width: 0, height: 0 });
    expect(Number.isFinite(gaze.yaw)).toBe(true);
    expect(Number.isFinite(gaze.pitch)).toBe(true);
  });
});
