import type { StylePack } from "@botavatar/engine";

/**
 * A deliberately different visual language from organic-blob: crisp geometry instead
 * of soft generated blobs, so the switcher proves the renderer is pack-driven. Not a
 * published package. Six shapes and eight colours give the 40-cell wall 48 combinations.
 */
export const clay: StylePack = {
  id: "clay",
  name: "Clay",
  version: "1.1.0",
  viewBox: "-60 -60 120 120",
  shapes: [
    // Rounded square: a 12-point squircle. Catmull-Rom already rounds the corners, so
    // no Chaikin pass is needed and the flat edges stay crisp.
    {
      smoothingPasses: 0,
      outline: [
        [-28, -38], [0, -40], [28, -38], [38, -28], [40, 0], [38, 28],
        [28, 38], [0, 40], [-28, 38], [-38, 28], [-40, 0], [-38, -28],
      ],
    },
    // Hexagon: six vertices plus edge midpoints, so Catmull-Rom follows the flat
    // edges instead of rounding the whole silhouette towards a circle.
    {
      smoothingPasses: 0,
      outline: [
        [0, -44], [19.05, -33], [38.1, -22], [38.1, 0], [38.1, 22], [19.05, 33],
        [0, 44], [-19.05, 33], [-38.1, 22], [-38.1, 0], [-38.1, -22], [-19.05, -33],
      ],
    },
    // Teardrop: a point at the top widening into a round body.
    {
      smoothingPasses: 0,
      outline: [
        [0, -52], [12, -36], [26, -16], [34, 6], [31, 26],
        [18, 38], [0, 44], [-18, 38], [-31, 26], [-34, 6], [-26, -16], [-12, -36],
      ],
    },
    // Capsule: a vertical pill with straight sides and semicircular caps.
    {
      smoothingPasses: 1,
      outline: [
        [-24, -22], [-21, -34], [-11, -42], [0, -44], [11, -42], [21, -34],
        [24, -22], [24, 22], [21, 34], [11, 42], [0, 44], [-11, 42],
        [-21, 34], [-24, 22],
      ],
    },
    // Five-point star: ten alternating radii, sharp because no smoothing pass runs.
    {
      smoothingPasses: 0,
      outline: [
        [0, -48], [11.76, -16.18], [45.65, -14.83], [19.02, 6.18], [28.21, 38.83],
        [0, 20], [-28.21, 38.83], [-19.02, 6.18], [-45.65, -14.83], [-11.76, -16.18],
      ],
    },
    // Arch: flat base, straight jambs and a rounded crown.
    {
      smoothingPasses: 1,
      outline: [
        [-32, 44], [-32, 4], [-29, -14], [-21, -29], [-9, -39], [0, -41],
        [9, -39], [21, -29], [29, -14], [32, 4], [32, 44],
      ],
    },
  ],
  palette: [
    { id: "terracotta", name: "Terracotta", light: "#FFD3C2", dark: "#BF5B34", eye: "#2A1208" },
    { id: "marigold", name: "Marigold", light: "#FFE2A8", dark: "#C99517", eye: "#2A1C04" },
    { id: "moss", name: "Moss", light: "#DFF0BC", dark: "#6F9A3C", eye: "#14230A" },
    { id: "lagoon", name: "Lagoon", light: "#BFF0E4", dark: "#2F9C8A", eye: "#07231F" },
    { id: "harbour", name: "Harbour", light: "#C4E8FA", dark: "#3D8FBF", eye: "#062030" },
    { id: "indigo", name: "Indigo", light: "#D3DAFF", dark: "#5B6BC0", eye: "#101638" },
    { id: "orchid", name: "Orchid", light: "#EBD3FA", dark: "#9B5BC0", eye: "#230F30" },
    { id: "rose", name: "Rose", light: "#FFD3E2", dark: "#C25B86", eye: "#300A1C" },
  ],
  eyes: {
    eyes: [{ kind: "ellipse", cx: -13, cy: 0, rx: 4, ry: 9 }, { kind: "ellipse", cx: 13, cy: 0, rx: 4, ry: 9 }],
    rotation: { modulo: 5, spread: 2 },
  },
  motion: {
    durationMsByFamily: [1500, 1700, 1600, 1900, 1400, 1800],
    amplitude: 1,
    // One clip per family, mixing body (breathe/bob/sway/tilt) and eye (blink/look-round) clips.
    clipByFamily: ["breathe", "blink", "sway", "look-round", "bob", "tilt"],
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
