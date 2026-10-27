import type { StylePack } from "@botavatar/engine";

/** Loader form: the pack is a named `pack` export, with no default export. */
export const pack: StylePack = {
  id: "named",
  name: "Named",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [{ outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 }],
  palette: [{ id: "named", name: "Named", light: "#FFE3BF", dark: "#E8590C", eye: "#3B2A1A" }],
  eyes: { eyes: [{ kind: "ellipse", cx: -12, cy: 0, rx: 4, ry: 9 }], rotation: { modulo: 5, spread: 2 } },
  motion: { durationMsByFamily: [1500], amplitude: 1 },
  assignment: "hash-only",
};
