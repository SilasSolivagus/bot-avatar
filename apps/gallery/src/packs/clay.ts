import type { StylePack } from "@botavatar/engine";

/** A deliberately different look, so the switcher has something to prove. Not a published package. */
export const clay: StylePack = {
  id: "clay",
  name: "Clay",
  version: "1.0.0",
  viewBox: "-60 -60 120 120",
  shapes: [
    { outline: [[0, -40], [40, 0], [0, 40], [-40, 0]], smoothingPasses: 0 },
    { outline: [[0, -44], [38, -14], [30, 36], [-30, 36], [-38, -14]], smoothingPasses: 1 },
  ],
  palette: [
    { id: "clay", name: "Clay", light: "#FFE3BF", dark: "#E8590C", eye: "#3B2A1A" },
    { id: "sage", name: "Sage", light: "#D8F3DC", dark: "#2D6A4F", eye: "#1B3A2B" },
  ],
  eyes: {
    eyes: [{ kind: "ellipse", cx: -13, cy: 0, rx: 4, ry: 9 }, { kind: "ellipse", cx: 13, cy: 0, rx: 4, ry: 9 }],
    rotation: { modulo: 5, spread: 2 },
  },
  motion: {
    durationMsByFamily: [1500, 1700],
    amplitude: 1,
    clipByFamily: ["breathe", "sway"],
  },
  assignment: "hash-only",
  surface: {
    // No `stops`: a constant stop table would override the palette's light/dark and
    // make every colour render the same orange. Highlight and shadow are palette-free.
    highlight: { cx: -16, cy: -14, r: 12, opacity: 0.45 },
    shadow: { dx: 0, dy: 3, blur: 5, color: "#000000" },
  },
};

/** The registry discovers packs through the glob's default export. */
export default clay;
