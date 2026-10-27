import type { AvatarSpec, PaletteColor, ShapeFamily, StylePack } from "@botavatar/engine";
import { outlinePath, phaseForSeed } from "@botavatar/engine";
import { renderSvg } from "@botavatar/svg";
import { PackError } from "./pack-error.js";

/** A pack may not cost more than this many renders to validate at startup. */
const MAX_RENDERS = 1000;
const RENDER_SIZE = 32;
const STATES = ["idle", "working"] as const;
/** Substrings that mean a number or an object leaked into the markup instead of a value. */
const BAD_OUTPUT = ["NaN", "undefined", "Infinity", "[object Object]"] as const;
/** Context around a bad token, so the error names the offending fragment rather than a line. */
const FRAGMENT_CONTEXT = 40;
const SVG_EDGE = 32;

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
    viewBox: pack.viewBox,
    surface: pack.surface,
  };
}

function fragmentAt(svg: string, index: number, length: number): string {
  return svg.slice(Math.max(0, index - FRAGMENT_CONTEXT), index + length + FRAGMENT_CONTEXT);
}

/**
 * Samples at most `cap` combinations with an even stride across the whole list instead of a
 * front slice, which would leave a large pack's tail unchecked. The final combination is
 * always included: when the stride is wider than the palette, an even stride can land
 * between the last family's combinations and never render that family at all.
 */
function sampleEvenly<T>(combos: readonly T[], cap: number): T[] {
  const stride = Math.ceil(combos.length / cap);
  const selected = combos.filter((_, index) => index % stride === 0);
  const lastIndex = combos.length - 1;
  if (selected.length > 0 && lastIndex % stride !== 0) {
    if (selected.length < cap) selected.push(combos[lastIndex]!);
    else selected[selected.length - 1] = combos[lastIndex]!;
  }
  return selected;
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
 * The domain is finite but can be large; above {@link MAX_RENDERS} it is sampled and
 * `sampled` is true, so the caller can warn instead of sampling silently.
 */
export function assertPackRenders(
  pack: StylePack,
  origin: string,
): { rendered: number; sampled: boolean } {
  const combos: Array<{ family: number; color: number }> = [];
  for (let family = 0; family < pack.shapes.length; family++) {
    for (let color = 0; color < pack.palette.length; color++) combos.push({ family, color });
  }
  const sampled = combos.length * STATES.length > MAX_RENDERS;
  const selected = sampled
    ? sampleEvenly(combos, Math.floor(MAX_RENDERS / STATES.length))
    : combos;
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

  return { rendered, sampled };
}
