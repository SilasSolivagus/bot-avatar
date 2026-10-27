export type ClipName =
  | "breathe"
  | "bob"
  | "sway"
  | "bounce"
  | "tilt"
  | "shake"
  | "blink"
  | "look-round";

export const CLIP_NAMES: readonly ClipName[] = [
  "breathe",
  "bob",
  "sway",
  "bounce",
  "tilt",
  "shake",
  "blink",
  "look-round",
];

export interface ClipFrame {
  translateY: number;
  scale: number;
  rotate: number;
  eyeScaleY: number;
  eyeOffsetX: number;
}

/** A loop whose endpoints are at rest, so it can repeat without a seam. */
export function clipFrame(clip: ClipName, progress: number, amplitude: number): ClipFrame {
  const at = Math.max(0, amplitude);
  const mid = (1 - Math.cos(progress * Math.PI * 2)) / 2;
  const swing = Math.sin(progress * Math.PI * 2);
  const frame: ClipFrame = { translateY: 0, scale: 1, rotate: 0, eyeScaleY: 1, eyeOffsetX: 0 };

  switch (clip) {
    case "breathe":
      frame.scale = 1 + 0.04 * at * mid;
      break;
    case "bob":
      frame.translateY = -5 * at * mid;
      break;
    case "sway":
      frame.rotate = 5 * at * mid;
      break;
    case "tilt":
      frame.rotate = 3 * at * swing;
      frame.translateY = -1.5 * at * mid;
      break;
    case "bounce":
      frame.translateY = -6 * at * mid;
      frame.scale = 1 + 0.05 * at * Math.sin(progress * Math.PI * 2);
      break;
    case "shake":
      frame.translateY = 1.5 * at * Math.sin(progress * Math.PI * 6);
      break;
    case "blink":
      // Closed at the midpoint, open at both ends. The 0.95 leaves a sliver so a
      // larger amplitude can still close the gap further instead of both clamping
      // to zero; at amplitude 1 the eyes are 5% of their height, visually shut.
      frame.eyeScaleY = Math.max(0, 1 - 0.95 * at * mid);
      break;
    case "look-round":
      frame.eyeOffsetX = 5 * at * swing;
      break;
  }
  // `-5 * 0` is `-0`, and `toEqual` (Object.is) distinguishes it from `0`, so a
  // rest frame would not equal REST. Normalise every signed-zero channel.
  if (frame.translateY === 0) frame.translateY = 0;
  if (frame.rotate === 0) frame.rotate = 0;
  if (frame.eyeOffsetX === 0) frame.eyeOffsetX = 0;
  return frame;
}
