import type {
  EyeGeometry,
  PaletteColor,
  ShapeFamily,
  SphereEyeRig,
  StylePack,
} from "@botavatar/engine";
import {
  harmonicProfile,
  hullOfCirclesProfile,
  normalizeRadii,
  radiiShape,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
} from "@botavatar/engine";

/**
 * The shape-profile demonstration pack.
 *
 * Every body is a 64-sample radius profile built by a generator, never a hand-drawn
 * polygon: the reference implementation stores silhouettes as `radii[64]` and keeps
 * visual weight even by normalizing each shape to its own target
 * (`docs/design/2026-10-28-shape-profiles.md`).
 *
 * The generators and the per-shape normalization targets are the reference's. The
 * concrete parameters below (superellipse exponent, polygon radii, circle layouts,
 * harmonic phases) and the whole palette are ours — the evidence doc leaves those
 * open on purpose (`docs/design/2026-10-28-shape-profiles.md` §6).
 */

/** Half-extent the normalized profiles are fitted to, in the pack's 120-unit viewBox. */
export const SHAPE_SCALE = 46;

/** A shape's normalization target is a multiple of {@link SHAPE_SCALE}. */
const scaled = (target: number): number => SHAPE_SCALE * target;

export interface ArtShapeSpec {
  id: string;
  name: string;
  /** The generator call, kept readable for docs and tests. */
  generator: string;
  /** Multiple of `SHAPE_SCALE` the largest radius is normalized to. */
  target: number;
  radii: readonly number[];
}

/**
 * The eight shapes, in wall order: circle, pebble, squircle, capsule, triangle,
 * hexagon, cloud, droplet.
 *
 * Only the squircle is normalized above 1: its maximum is on the diagonal, so
 * normalizing it like the circle would make it look smaller than the circle — the
 * exact defect this pack is meant to remove. Cloud and pebble get 1.02 and the
 * droplet 1.04 so their off-axis lobes keep the same visual weight.
 */
export const artShapes: readonly ArtShapeSpec[] = [
  {
    id: "circle",
    name: "Circle",
    generator: "superellipseProfile(2)",
    target: 1,
    radii: normalizeRadii(superellipseProfile(2), scaled(1)),
  },
  {
    id: "pebble",
    name: "Pebble",
    generator: "harmonicProfile([7.5% cos(2a+0.5), 3.5% cos(3a+2.1)], 1)",
    target: 1.02,
    radii: normalizeRadii(
      harmonicProfile(
        [
          { amplitude: 0.075, frequency: 2, phase: 0.5 },
          { amplitude: 0.035, frequency: 3, phase: 2.1 },
        ],
        1,
      ),
      scaled(1.02),
    ),
  },
  {
    id: "squircle",
    name: "Squircle",
    generator: "superellipseProfile(4.2)",
    target: 1.15,
    radii: normalizeRadii(superellipseProfile(4.2), scaled(1.15)),
  },
  {
    id: "capsule",
    name: "Capsule",
    generator: "hullOfCirclesProfile((0, 20, r 24), (0, -20, r 24))",
    target: 1,
    radii: normalizeRadii(
      hullOfCirclesProfile({ x: 0, y: 20, r: 24 }, { x: 0, y: -20, r: 24 }),
      scaled(1),
    ),
  },
  {
    id: "triangle",
    name: "Triangle",
    generator: "regularPolygonProfile(3, 1.12, 0.34, -90)",
    target: 1,
    radii: normalizeRadii(regularPolygonProfile(3, 1.12, 0.34, -90), scaled(1)),
  },
  {
    id: "hexagon",
    name: "Hexagon",
    generator: "regularPolygonProfile(6, 1.04, 0.26, 0)",
    target: 1,
    radii: normalizeRadii(regularPolygonProfile(6, 1.04, 0.26, 0), scaled(1)),
  },
  {
    id: "cloud",
    name: "Cloud",
    generator: "unionOfCirclesProfile(five discs)",
    target: 1.02,
    radii: normalizeRadii(
      unionOfCirclesProfile([
        { x: -21, y: 5, r: 19 },
        { x: 21, y: 5, r: 19 },
        { x: 0, y: 14, r: 21 },
        { x: -11, y: -12, r: 17 },
        { x: 13, y: -10, r: 16 },
      ]),
      scaled(1.02),
    ),
  },
  {
    id: "droplet",
    name: "Droplet",
    generator: "hullOfCirclesProfile((0, 10, r 30), (0, -30, r 9))",
    target: 1.04,
    radii: normalizeRadii(
      hullOfCirclesProfile({ x: 0, y: 10, r: 30 }, { x: 0, y: -30, r: 9 }),
      scaled(1.04),
    ),
  },
];

const families: readonly ShapeFamily[] = artShapes.map((shape) => radiiShape(shape.radii));

/**
 * Nine chromatic colours plus ink, grey and cream.
 *
 * Every chromatic light value sits at 98.5% of its hue's sRGB gamut limit for the
 * stated OKLCH lightness, so the twelve read as distinct colours rather than as one
 * grey of varying brightness. The lightness axis spans 0.16 (ink) to 0.95 (cream).
 * These values are ours; the reference's twelve hand-picked colours are not copied.
 *
 * Eyes are the v1 dark ink on every colour except `ink`, whose body is too dark for
 * a dark eye to read; that one gets cream eyes.
 */
const EYE_DARK = "#141414";

export const artPalette: readonly PaletteColor[] = [
  { id: "ink", name: "Ink", light: "#23252E", dark: "#0C0D12", eye: "#FBF3E4" },
  { id: "red", name: "Vermilion", light: "#D40A24", dark: "#850313", eye: EYE_DARK },
  { id: "orange", name: "Tangerine", light: "#E5820C", dark: "#A25A05", eye: EYE_DARK },
  { id: "yellow", name: "Saffron", light: "#F5CE14", dark: "#BA9C0C", eye: EYE_DARK },
  { id: "green", name: "Meadow", light: "#45D30F", dark: "#309908", eye: EYE_DARK },
  { id: "teal", name: "Jade", light: "#0B9B89", dark: "#05675A", eye: EYE_DARK },
  { id: "cyan", name: "Lagoon", light: "#087F94", dark: "#034E5C", eye: EYE_DARK },
  { id: "blue", name: "Cobalt", light: "#0460A5", dark: "#01345E", eye: EYE_DARK },
  { id: "violet", name: "Iris", light: "#804CFD", dark: "#5606BF", eye: EYE_DARK },
  { id: "magenta", name: "Fuchsia", light: "#F510EE", dark: "#AC08A6", eye: EYE_DARK },
  { id: "grey", name: "Slate", light: "#8E8E8E", dark: "#5F5F5F", eye: EYE_DARK },
  { id: "cream", name: "Cream", light: "#F9EDD5", dark: "#E2CBA4", eye: EYE_DARK },
];

/**
 * The sphere rig: size, spacing and anchor are derived from each profile by
 * `buildGeometry`; only the optics are the pack's. The values match the gallery's
 * other sphere packs so the three can be compared side by side.
 */
export const artEyes: SphereEyeRig = {
  kind: "sphere",
  // Cut-out eyes: the capsules take the card's surface colour, so an avatar reads as
  // a hole in its own card on any background.
  eyePaint: "surface",
  sphereRadius: 44,
  eyes: [
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
    { lateralDeg: 0, verticalDeg: 0, halfWidth: 0, halfHeight: 0, tiltDeg: 0 },
  ],
  fadeFromDepth: 0.12,
  cullAtDepth: 0.02,
  bodyCoupling: 0.35,
  bodyPitchFollow: 0.35,
  restTiltDeg: -4,
};

export const art: StylePack = {
  id: "art",
  name: "Art",
  version: "0.1.0",
  viewBox: "-60 -60 120 120",
  shapes: families,
  palette: artPalette,
  // A sphere rig is not a v1 `EyeGeometry`; `buildGeometry` reads `kind` through the
  // same boundary cast the other sphere packs use.
  eyes: artEyes as unknown as EyeGeometry,
  motion: {
    durationMsByFamily: [1800, 1500, 2400, 1700, 1350, 2200, 2000, 1600],
    amplitude: 1,
    clipByFamily: [
      "breathe",
      "sway",
      "look-round",
      "bob",
      "tilt",
      "blink",
      "bounce",
      "shake",
    ],
  },
  assignment: "hash-only",
};

/** The registry discovers packs through the glob's default export. */
export default art;
