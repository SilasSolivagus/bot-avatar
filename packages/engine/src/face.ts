import type { Point } from "./geometry.js";

/**
 * The knobs a pack may use to adjust the derived face. Every value is a ratio or a
 * viewBox-unit clearance so it stays independent of the shape's own scale.
 */
export interface FaceStyle {
  /** 眼睛尺寸相对轮廓最小半径的比例 */
  eyeHeightRatio?: number;
  /** 高/宽，默认 2.27（即宽 ≈ 高 × 0.44） */
  eyeAspect?: number;
  /** 眼睛中心相对轮廓的上下偏移比例 */
  centreOffsetRatio?: number;
  /** 眼睛与轮廓的最小留白（viewBox 单位） */
  margin?: number;
}

/** The face parameters a body outline implies. */
export interface Face {
  /** 轮廓在 ±50° 内的最小半径，脸的"可用空间" */
  rMin: number;
  /** 两只眼睛各自偏离正前方的角度，度 */
  splitDeg: number;
  halfWidth: number;
  halfHeight: number;
  /** 眼睛锚点在竖直方向上的偏移，viewBox 单位 */
  dy: number;
}

const EYE_HEIGHT_RATIO = 0.3;
/** 高/宽 = 1 / 0.44；默认宽恰好是高 × 0.44。 */
const EYE_WIDTH_RATIO = 0.44;
const CENTRE_OFFSET_RATIO = -0.14;
const MARGIN = 2;
const HALF_HEIGHT_MIN = 5;
const HALF_HEIGHT_MAX = 12;
const SPLIT_FACTOR = 2.4;
const SPLIT_SIN_MAX = 0.9;
const SPLIT_DEG_MIN = 4;
const SCAN_DEG = 50;
const SCAN_STEP_DEG = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * The distance from the origin to `outline` along `angleRad`: a ray/polygon
 * intersection, taking the nearest forward hit.
 *
 * Origin-inside, star-shaped outlines cross the ray exactly once, so the loop is
 * looking for one value; taking the minimum keeps it well-defined for outlines that
 * cross more than once. A degenerate outline (or an origin outside the polygon)
 * returns 0 rather than NaN, so callers can treat "no outline here" as no radius.
 */
export function radiusAtAngle(outline: ReadonlyArray<Point>, angleRad: number): number {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  let nearest = Infinity;
  for (let index = 0; index < outline.length; index++) {
    const [x1, y1] = outline[index]!;
    const [x2, y2] = outline[(index + 1) % outline.length]!;
    const ex = x2 - x1;
    const ey = y2 - y1;
    // Ray: t·d = p1 + u·(p2 − p1). `den` is the determinant; a parallel edge cannot
    // hit, and skipping it also avoids dividing by zero on axis-aligned outlines.
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (x1 * ey - y1 * ex) / den;
    const u = (dy * x1 - dx * y1) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < nearest) nearest = t;
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

/**
 * Derives the face from the body outline, so a pack author never writes eye sizes.
 *
 * The rule is deliberately scale-free: measure how much room the shape has in the
 * frontal ±50° cone (`rMin`), size the eye as a fraction of it, then open the eye
 * pair just enough that their inner edges almost touch. A shape with a tight cheek
 * (a star) therefore gets small, close eyes instead of eyes that spill out.
 */
export function deriveFace(outline: ReadonlyArray<Point>, style?: FaceStyle): Face {
  const heightRatio = style?.eyeHeightRatio ?? EYE_HEIGHT_RATIO;
  const aspect = style?.eyeAspect;
  const widthRatio =
    aspect !== undefined && Number.isFinite(aspect) && aspect > 0 ? 1 / aspect : EYE_WIDTH_RATIO;
  const offsetRatio = style?.centreOffsetRatio ?? CENTRE_OFFSET_RATIO;
  const margin = style?.margin ?? MARGIN;

  let rMin = Infinity;
  for (let degrees = -SCAN_DEG; degrees <= SCAN_DEG; degrees += SCAN_STEP_DEG) {
    const radius = radiusAtAngle(outline, (degrees * Math.PI) / 180);
    if (radius > 0 && radius < rMin) rMin = radius;
  }
  if (!Number.isFinite(rMin)) rMin = 0;

  // `margin` is the desired clearance to the outline. With the 5–12 bounds above it
  // only bites on a very small outline, where it correctly keeps the eye off the edge
  // instead of letting the lower clamp win.
  const halfHeight = clamp(
    heightRatio * rMin,
    HALF_HEIGHT_MIN,
    Math.min(HALF_HEIGHT_MAX, rMin - margin),
  );
  const halfWidth = halfHeight * widthRatio;
  const splitSin = rMin > 0 ? clamp((SPLIT_FACTOR * halfWidth) / rMin, 0, SPLIT_SIN_MAX) : 0;
  const splitDeg = Math.max(SPLIT_DEG_MIN, (Math.asin(splitSin) * 180) / Math.PI);

  return {
    rMin,
    splitDeg,
    halfWidth,
    halfHeight,
    dy: offsetRatio * rMin,
  };
}
