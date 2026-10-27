import type { StylePack } from "@botavatar/engine";

/**
 * Loader form: no default export and no named `pack` export. The module
 * namespace itself carries the pack fields, so it is the pack object.
 */
export const id = "fields";
export const name = "Fields";
export const version = "1.0.0";
export const viewBox = "-60 -60 120 120";
export const shapes: StylePack["shapes"] = [
  { outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 },
];
export const palette: StylePack["palette"] = [
  { id: "fields", name: "Fields", light: "#FFE3BF", dark: "#E8590C", eye: "#3B2A1A" },
];
export const eyes: StylePack["eyes"] = {
  eyes: [{ kind: "ellipse", cx: -12, cy: 0, rx: 4, ry: 9 }],
  rotation: { modulo: 5, spread: 2 },
};
export const motion: StylePack["motion"] = {
  durationMsByFamily: [1500],
  amplitude: 1,
  clipByFamily: ["breathe"],
};
export const assignment: StylePack["assignment"] = "hash-only";
