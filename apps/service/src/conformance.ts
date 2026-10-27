import type { AvatarSpec, PaletteColor, ShapeFamily, StylePack } from "@botavatar/engine";
import { outlinePath, phaseForSeed } from "@botavatar/engine";
import { renderSvg } from "@botavatar/svg";
import { PackError } from "./pack-error.js";

/** A pack may not cost more than this many renders to validate at startup. */
const MAX_RENDERS = 1000;
const RENDER_SIZE = 32;
const STATES = ["idle", "working"] as const;
/** The render cap counted in `(shape, colour)` combinations, each rendered once per state. */
const MAX_COMBINATIONS = Math.floor(MAX_RENDERS / STATES.length);
/** Substrings that mean a number or an object leaked into the markup instead of a value. */
const BAD_OUTPUT = ["NaN", "undefined", "Infinity", "[object Object]"] as const;
/** Context around a bad token, so the error names the offending fragment rather than a line. */
const FRAGMENT_CONTEXT = 40;
const SVG_EDGE = 32;

/** One inclusive range of dimension values the sample could not reach. */
export interface UncoveredRange {
  start: number;
  end: number;
}

/** The shape and colour index ranges the sample did not cover, in index order. */
export interface UncoveredDimensions {
  shapes: UncoveredRange[];
  colors: UncoveredRange[];
}

export interface ConformanceResult {
  /** SVG renders performed: one per selected combination and state. */
  rendered: number;
  /** True when the domain exceeded {@link MAX_RENDERS} and was sampled. */
  sampled: boolean;
  /** Values the sample could not reach; empty when that dimension is fully covered. */
  uncovered: UncoveredDimensions;
}

interface Combo {
  family: number;
  color: number;
}

/**
 * The spec the renderer would receive for one family and colour. `buildAvatarSpec`
 * derives both from a hash, so the sweep builds this directly instead: the body comes
 * from that family's outline, the colour from that palette entry.
 */
function specFor(
  pack: StylePack,
  shape: ShapeFamily,
  color: PaletteColor,
  family: number,
  colorIndex: number,
): AvatarSpec {
  const seed = family * 1000 + colorIndex;
  return {
    packId: pack.id,
    packVersion: pack.version,
    identity: `conformance-${family}-${colorIndex}`,
    seed,
    family,
    look: shape.look ?? family,
    color,
    path: outlinePath(shape.outline, {
      phase: phaseForSeed(seed),
      smoothingPasses: shape.smoothingPasses,
    }),
    eyes: pack.eyes.eyes,
    eyeRotation: (seed % pack.eyes.rotation.modulo) - pack.eyes.rotation.spread,
    durationMs: pack.motion.durationMsByFamily[family] ?? 1800,
    motionAmplitude: pack.motion.amplitude,
    clip: pack.motion.clipByFamily[family] ?? "breathe",
    viewBox: pack.viewBox,
    surface: pack.surface,
  };
}

function fragmentAt(svg: string, index: number, length: number): string {
  return svg.slice(Math.max(0, index - FRAGMENT_CONTEXT), index + length + FRAGMENT_CONTEXT);
}

/** Inclusive ranges of `0..total-1` missing from the sorted, unique `selected` indices. */
function complementRanges(selected: readonly number[], total: number): UncoveredRange[] {
  const ranges: UncoveredRange[] = [];
  let next = 0;
  for (const index of selected) {
    if (index > next) ranges.push({ start: next, end: index - 1 });
    next = index + 1;
  }
  if (next < total) ranges.push({ start: next, end: total - 1 });
  return ranges;
}

/**
 * Picks `budget` family indices spread over `0..shapeCount-1`, including both ends. The
 * last family is forced in: an even stride can otherwise stop just short of it and leave
 * a pack's tail unrendered. Only called when `shapeCount > budget`.
 */
function selectShapes(shapeCount: number, budget: number): number[] {
  const selected: number[] = [];
  for (let slot = 0; slot < budget; slot += 1) {
    selected.push(Math.floor((slot * shapeCount) / budget));
  }
  selected[selected.length - 1] = shapeCount - 1;
  return selected;
}

/**
 * Recolours duplicate combinations until every palette entry appears at least once.
 * Recolouring keeps the family, so shape coverage is untouched, and only a colour that
 * occurs more than once is dropped, so no earlier colour coverage is lost. A sampled
 * sweep has `budget` combinations and at most `budget` colours, so a missing colour
 * implies a duplicate exists. No-op when the palette itself exceeds the budget.
 */
function coverEveryColor(combos: Combo[], colorCount: number): void {
  if (colorCount > combos.length) return;
  const counts = new Array<number>(colorCount).fill(0);
  for (const combo of combos) counts[combo.color]! += 1;
  for (let color = 0; color < colorCount; color += 1) {
    if (counts[color]! > 0) continue;
    const donor = combos.findIndex((combo) => counts[combo.color]! > 1);
    if (donor === -1) return;
    const combo = combos[donor]!;
    counts[combo.color]! -= 1;
    combo.color = color;
    counts[color]! += 1;
  }
}

/**
 * Selects at most `budget` combinations, stratified by dimension instead of by a stride
 * over the flattened family-major list. A flat stride can share a factor with the palette
 * length and touch only one residue class of colours.
 *
 * Shapes: when every shape fits in the budget, each gets a quota. When it does not, the
 * selected shapes are evenly spaced and the rest are reported through `uncovered`.
 * Colours: shape `i` starts at colour `i % palette.length` and walks the palette, so the
 * sample as a whole covers residues; a final pass closes any remaining palette gap.
 */
function selectCombinations(shapeCount: number, colorCount: number, budget: number): Combo[] {
  const combos: Combo[] = [];
  if (shapeCount > budget) {
    for (const family of selectShapes(shapeCount, budget)) {
      combos.push({ family, color: family % colorCount });
    }
  } else {
    const base = Math.floor(budget / shapeCount);
    const extra = budget % shapeCount;
    for (let family = 0; family < shapeCount; family += 1) {
      const quota = base + (family < extra ? 1 : 0);
      for (let step = 0; step < quota; step += 1) {
        combos.push({ family, color: (family + step) % colorCount });
      }
    }
  }
  coverEveryColor(combos, colorCount);
  return combos;
}

/** Throws unless `svg` is a well-formed document with no leaked non-values. */
function assertUsableSvg(svg: string, where: string): void {
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) {
    throw new PackError(
      `${where} is not an svg (starts ${JSON.stringify(svg.slice(0, SVG_EDGE))}, ` +
        `ends ${JSON.stringify(svg.slice(-SVG_EDGE))})`,
    );
  }
  for (const token of BAD_OUTPUT) {
    const index = svg.indexOf(token);
    if (index !== -1) {
      throw new PackError(
        `${where} contains ${JSON.stringify(token)} near ` +
          `${JSON.stringify(fragmentAt(svg, index, token.length))}`,
      );
    }
  }
}

/**
 * Renders every body and every colour this pack can produce, in both states. A pack
 * that only breaks on one family or one colour fails here, at startup, instead of
 * answering 500 to the requests that happen to land on that combination.
 *
 * The domain is finite but can be large; above {@link MAX_RENDERS} it is sampled within
 * a {@link MAX_COMBINATIONS} budget and `sampled` is true, so the caller can warn instead
 * of sampling silently. The sample covers every shape and every colour whenever that
 * dimension fits the budget; `uncovered` names the index ranges it could not reach.
 */
export function assertPackRenders(pack: StylePack, origin: string): ConformanceResult {
  const shapeCount = pack.shapes.length;
  const colorCount = pack.palette.length;
  const sampled = shapeCount * colorCount > MAX_COMBINATIONS;
  const selected: Combo[] = [];
  if (sampled) {
    selected.push(...selectCombinations(shapeCount, colorCount, MAX_COMBINATIONS));
  } else {
    // Below the budget the sweep stays exhaustive, in the original family-major order.
    for (let family = 0; family < shapeCount; family++) {
      for (let color = 0; color < colorCount; color++) selected.push({ family, color });
    }
  }
  const rendered = selected.length * STATES.length;

  for (const { family, color } of selected) {
    const shape = pack.shapes[family]!;
    const paletteColor = pack.palette[color]!;
    for (const state of STATES) {
      const where = `${origin}: family ${family} colour ${color} ${state}`;
      let svg: string;
      try {
        svg = renderSvg(specFor(pack, shape, paletteColor, family, color), {
          size: RENDER_SIZE,
          state,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new PackError(`${where} failed to render (${message})`);
      }
      assertUsableSvg(svg, where);
    }
  }

  const coveredShapes = [...new Set(selected.map(({ family }) => family))].sort((a, b) => a - b);
  const coveredColors = [...new Set(selected.map(({ color }) => color))].sort((a, b) => a - b);
  return {
    rendered,
    sampled,
    uncovered: {
      shapes: complementRanges(coveredShapes, shapeCount),
      colors: complementRanges(coveredColors, colorCount),
    },
  };
}
