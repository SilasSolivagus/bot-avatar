import type { StylePack } from "@botavatar/engine";

const pack: StylePack = {
  id: "clay",
  name: "Clay",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [{ outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 }],
  palette: [{ id: "clay", name: "Clay", light: "#FFD8A8", dark: "#E8590C", eye: "#3B2A1A" }],
  eyes: { eyes: [{ kind: "ellipse", cx: -12, cy: 0, rx: 4, ry: 9 }], rotation: { modulo: 5, spread: 2 } },
  motion: { durationMsByFamily: [1500], amplitude: 1, clipByFamily: ["breathe"] },
  assignment: "hash-only",
  surface: {
    stops: [
      { offset: 0, color: "#FFE3BF" },
      { offset: 1, color: "#E8590C" },
    ],
    highlight: { cx: -16, cy: -14, r: 12, opacity: 0.45 },
    shadow: { dx: 0, dy: 3, blur: 5, color: "#000000" },
  },
};

export default pack;
