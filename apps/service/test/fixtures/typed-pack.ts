import type { StylePack } from "@botavatar/engine";

/**
 * Loader form: `eyes.eyes[0].x` is a string. Without the parse boundary this passes
 * presence checks and the renderer emits `<rect x="x" />`, which is not valid SVG.
 */
const pack: StylePack = {
  id: "typed",
  name: "Typed",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [{ outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 }],
  palette: [{ id: "typed", name: "Typed", light: "#FFE3BF", dark: "#E8590C", eye: "#3B2A1A" }],
  eyes: { eyes: [{ kind: "rect", x: -12, y: -10, width: 6, height: 20, rx: 3 }], rotation: { modulo: 9, spread: 4 } },
  motion: { durationMsByFamily: [1500], amplitude: 1, clipByFamily: ["breathe"] },
  assignment: "hash-only",
};

(pack.eyes.eyes[0] as { x: unknown }).x = "x";

export default pack;
