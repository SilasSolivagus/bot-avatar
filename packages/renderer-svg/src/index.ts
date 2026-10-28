import { clipFrame, outlinePath, projectEye, radiusAtAngle } from "@botavatar/engine";
import type {
  AvatarGeometry,
  AvatarSpec,
  ClipFrame,
  Point,
  SphereEyeRig,
} from "@botavatar/engine";

export interface RenderOptions {
  size: number;
  state?: "idle" | "working";
}

export interface AvatarRenderer<Out> {
  render(spec: AvatarSpec, options: RenderOptions): Out;
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** FNV-1a over the colour fields: stable across processes, and cheap. */
function colorDigest(parts: readonly string[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    for (let index = 0; index < part.length; index++) {
      hash = Math.imul(hash ^ part.charCodeAt(index), 16777619);
    }
    hash = Math.imul(hash ^ 0x7c, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Ids must be unique per *rendered thing*, not per identity: the same identity
 * can be rendered twice with different colours (a pack switch, or two packs on
 * one page), and SVG ids are document-global. Without the colour digest the
 * second avatar silently borrows the first one's gradient.
 */
function avatarId(packId: string, seed: number, digest: string): string {
  const base = `${packId}-${seed}-${digest}`;
  return `av-${escapeAttribute(base)}`.replace(/[^A-Za-z0-9_-]/g, "-");
}

function specId(spec: AvatarSpec): string {
  return avatarId(
    spec.packId,
    spec.seed,
    colorDigest([spec.color.id, spec.color.light, spec.color.dark, spec.color.eye]),
  );
}

/**
 * The eye colour takes part in the digest: two avatars with the same body colour
 * but different eyes still collide otherwise, and one would borrow the other's
 * gradient id.
 */
function geometryId(geometry: AvatarGeometry): string {
  return avatarId(
    geometry.packId,
    geometry.seed,
    colorDigest([
      geometry.ink.bodyId,
      geometry.ink.body,
      geometry.ink.bodyHighlight,
      geometry.ink.eyes,
    ]),
  );
}

function eyeMarkup(spec: AvatarSpec): string {
  return spec.eyes
    .map((eye) =>
      eye.kind === "rect"
        ? `<rect x="${eye.x}" y="${eye.y}" width="${eye.width}" height="${eye.height}" rx="${eye.rx}" />`
        : `<ellipse cx="${eye.cx}" cy="${eye.cy}" rx="${eye.rx}" ry="${eye.ry}" />`,
    )
    .join("");
}

/**
 * Quarter steps, not just the endpoints and midpoint: shake, tilt and look-round are
 * neutral at 0 and 0.5, so sampling only those would emit an animation that never
 * moves. 0 and 1 are rest, so the loop has no seam.
 */
const FRAME_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

/** Fixed decimal output: deterministic bytes, and `-0` is never emitted. */
function number(value: number): string {
  const rounded = Number(value.toFixed(3));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Clearance between the outermost point of a capsule and the body outline, in viewBox units. */
export const EYE_FIT_MARGIN = 2.5;

export interface FittedEye {
  x: number;
  y: number;
  /** True when the projection would have left the silhouette and was pulled in. */
  clamped: boolean;
}

/**
 * Pulls a projected eye's centre towards the origin until the capsule's outermost
 * point fits inside the body outline along its own direction. The eyes sit on the
 * head's sphere, but the body is not a circle: when the gaze turns, the far eye can
 * land where the silhouette is narrow and the mask would slice the capsule.
 *
 * The capsule is bounded by the circle around its centre with radius
 * `max(halfWidth, halfLength)`, so the fit holds for every rotation of the capsule.
 * The caller folds the face anchor (`anchorY`) into `y` before calling: the fit has
 * to see the point that is actually drawn, or the anchor would push the capsule back
 * outside after the clamp.
 */
export function fitEyeToOutline(
  outline: ReadonlyArray<Point>,
  x: number,
  y: number,
  halfWidth: number,
  halfLength: number,
  margin = EYE_FIT_MARGIN,
): FittedEye {
  const distance = Math.hypot(x, y);
  if (distance === 0) return { x, y, clamped: false };
  const room =
    radiusAtAngle(outline, Math.atan2(y, x)) - (Math.max(halfWidth, halfLength) + margin);
  if (distance <= room) return { x, y, clamped: false };
  // A room of zero or less means the outline has no place for this eye at all; the
  // capsule then sits at the centre rather than outside the body.
  const scale = Math.max(0, room) / distance;
  return { x: x * scale, y: y * scale, clamped: true };
}

/** The fields the working animation reads; `AvatarSpec` and `AvatarGeometry` both carry them. */
type Animation = Pick<AvatarSpec, "clip" | "durationMs" | "motionAmplitude">;

function keyframes(
  name: string,
  animation: Animation,
  transform: (frame: ClipFrame) => string,
): string {
  return `@keyframes ${name}{${FRAME_STEPS.map((progress) => {
    const frame = clipFrame(animation.clip, progress, animation.motionAmplitude);
    return `${number(progress * 100)}%{transform:${transform(frame)}}`;
  }).join("")}}`;
}

function workingStyle(animation: Animation, id: string): string {
  const body = `${id}-body`;
  const eyes = `${id}-eyes`;
  const timing = `${animation.durationMs}ms ease-in-out infinite`;
  return (
    `<style>` +
    keyframes(
      body,
      animation,
      (frame) =>
        `translate(0px, ${number(frame.translateY)}px) scale(${number(frame.scale)}) rotate(${number(frame.rotate)}deg)`,
    ) +
    keyframes(
      eyes,
      animation,
      (frame) => `translate(${number(frame.eyeOffsetX)}px, 0px) scaleY(${number(frame.eyeScaleY)})`,
    ) +
    // Without `transform-box: fill-box` the origin resolves against the SVG viewport,
    // so the body and eyes rotate around the wrong point and fly off.
    `.${body}{transform-box: fill-box;transform-origin: center;animation:${body} ${timing}}` +
    `.${eyes}{transform-box: fill-box;transform-origin: center;animation:${eyes} ${timing}}` +
    `@media (prefers-reduced-motion: reduce){.${body},.${eyes}{animation:none}}` +
    `</style>`
  );
}

function gradient(id: string, stops: string): string {
  return `<linearGradient id="${id}-fill" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`;
}

/** The ink gradient: the pack's material stops when it has any, otherwise light to dark. */
function fillDefs(spec: AvatarSpec, id: string): string {
  const stops = spec.surface?.stops;
  if (!stops?.length) {
    return gradient(
      id,
      `<stop offset="0%" stop-color="${escapeAttribute(spec.color.light)}" />` +
        `<stop offset="100%" stop-color="${escapeAttribute(spec.color.dark)}" />`,
    );
  }
  return gradient(
    id,
    stops
      .map(
        (stop) =>
          `<stop offset="${stop.offset * 100}%" stop-color="${escapeAttribute(stop.color)}" />`,
      )
      .join(""),
  );
}

/** A sphere rig has no surface vocabulary yet: two stops straight from the ink. */
function inkGradient(geometry: AvatarGeometry, id: string): string {
  return gradient(
    id,
    `<stop offset="0%" stop-color="${escapeAttribute(geometry.ink.body)}" />` +
      `<stop offset="100%" stop-color="${escapeAttribute(geometry.ink.bodyHighlight)}" />`,
  );
}

function highlight(spec: AvatarSpec, id: string): { defs: string; shape: string } {
  const shine = spec.surface?.highlight;
  if (!shine) return { defs: "", shape: "" };
  return {
    defs:
      `<radialGradient id="${id}-shine" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#FFFFFF" stop-opacity="${shine.opacity}" />` +
      `<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0" />` +
      `</radialGradient>`,
    shape: `<ellipse cx="${shine.cx}" cy="${shine.cy}" rx="${shine.r}" ry="${shine.r}" clip-path="url(#${id}-clip)" fill="url(#${id}-shine)" />`,
  };
}

/** A clip path around the body, so surface material never paints outside it. */
function clipPathDef(spec: AvatarSpec, id: string): string {
  return `<clipPath id="${id}-clip"><path d="${escapeAttribute(spec.path)}" /></clipPath>`;
}

function shadowDefs(spec: AvatarSpec, id: string): string {
  const shadow = spec.surface?.shadow;
  if (!shadow) return "";
  return (
    `<filter id="${id}-shadow" x="-40%" y="-40%" width="180%" height="180%">` +
    `<feDropShadow dx="${shadow.dx}" dy="${shadow.dy}" stdDeviation="${shadow.blur}"` +
    ` flood-color="${escapeAttribute(shadow.color)}" />` +
    `</filter>`
  );
}

/** The four numbers of the viewBox, in the order x, y, width, height. */
function viewport(spec: AvatarSpec): [number, number, number, number] {
  const parts = spec.viewBox.trim().split(/\s+/).map(Number);
  return [parts[0] ?? -60, parts[1] ?? -60, parts[2] ?? 120, parts[3] ?? 120];
}

function grainMarkup(spec: AvatarSpec, id: string): string {
  const texture = spec.surface?.texture;
  if (!texture || texture.kind === "none") return "";
  const [x, y, width, height] = viewport(spec);
  return (
    `<filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" />` +
    `<feColorMatrix type="saturate" values="0" /></filter>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}"` +
    ` clip-path="url(#${id}-clip)" filter="url(#${id}-grain)" opacity="${texture.opacity}" />`
  );
}

/** Renders a spec to a standalone SVG string. No DOM, no globals. */
export function renderSvg(spec: AvatarSpec, { size, state = "idle" }: RenderOptions): string {
  const pixels = Math.max(1, Math.round(size));
  const id = specId(spec);
  const working = state === "working";
  const shine = highlight(spec, id);
  const shadowed = spec.surface?.shadow ? ` filter="url(#${id}-shadow)"` : "";
  const clipped = Boolean(
    spec.surface?.highlight || (spec.surface?.texture && spec.surface.texture.kind !== "none"),
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(spec.viewBox)}"` +
    ` width="${pixels}" height="${pixels}" aria-hidden="true">` +
    (working ? workingStyle(spec, id) : "") +
    `<defs>${fillDefs(spec, id)}${shine.defs}${shadowDefs(spec, id)}${clipped ? clipPathDef(spec, id) : ""}</defs>` +
    `<g${working ? ` class="${id}-body"` : ""}${shadowed}>` +
    `<path d="${escapeAttribute(spec.path)}" fill="url(#${id}-fill)" />` +
    shine.shape +
    // The static tilt stays on the outer group; the clip's eye channels animate an
    // inner group, so the two transforms never overwrite each other.
    `<g transform="rotate(${spec.eyeRotation})" fill="${escapeAttribute(spec.color.eye)}">` +
    (working ? `<g class="${id}-eyes">${eyeMarkup(spec)}</g>` : eyeMarkup(spec)) +
    `</g></g>` +
    grainMarkup(spec, id) +
    `</svg>`
  );
}

/**
 * The sphere rig draws itself: no `AvatarSpec` can express it, since `AvatarSpec.eyes`
 * only holds rects. The body comes from the outline, the eyes from `projectEye`, and
 * the gradient from the ink.
 *
 * Each eye is a true capsule in local space: the projection is decomposed into a
 * rotation and two half-extents, and the rect is drawn at that size with its own
 * rotation. The projection matrix is never handed to the rect — doing that squashes
 * the rounded ends into an ellipse.
 */
function renderSphere(
  geometry: AvatarGeometry,
  rig: SphereEyeRig,
  { size, state = "idle" }: RenderOptions,
): string {
  // The sphere branch paints an ink-only gradient. Refuse rather than silently drop
  // material a pack asked for: a surfaced sphere pack must not render flat unnoticed.
  if (geometry.surface) {
    throw new Error("renderGeometry: sphere rigs do not support surface material yet");
  }
  const pixels = Math.max(1, Math.round(size));
  const working = state === "working";
  const id = geometryId(geometry);
  const path = outlinePath(geometry.body.outline, {
    phase: geometry.body.phase,
    smoothingPasses: geometry.body.smoothingPasses,
  });

  // Body coupling splits the *same* total yaw between head and eyes: the group takes
  // `yaw × coupling`, the projection keeps `yaw × (1 − coupling)`. Rotating the group
  // without shrinking the projected yaw would turn the eyes twice. A coupling of 0
  // (or a zero turn) must emit no wrapper at all, so today's bytes are untouched.
  const coupling = Number.isFinite(rig.bodyCoupling) ? clamp01(rig.bodyCoupling) : 0;
  const turn = number(geometry.pose.gaze.yaw * coupling);
  const turned = turn !== "0";
  // The same split for pitch: the head carries `bodyPitchFollow` as a vertical nod,
  // the projection keeps the rest. The 0.6 is the head's lever arm in viewBox units.
  const pitchFollow = Number.isFinite(rig.bodyPitchFollow) ? clamp01(rig.bodyPitchFollow!) : 0;
  const nod = number(-geometry.pose.gaze.pitch * pitchFollow * 0.6);
  const nodded = nod !== "0";
  const anchorY = Number.isFinite(rig.anchorY) ? rig.anchorY! : 0;
  const eyePose = {
    ...geometry.pose,
    gaze: {
      yaw: geometry.pose.gaze.yaw * (1 - coupling),
      pitch: geometry.pose.gaze.pitch * (1 - pitchFollow),
    },
  };

  let capsules = "";
  for (const index of [0, 1] as const) {
    const projected = projectEye(rig, eyePose, index);
    // Depth is the sphere normal's z. Between the two thresholds the eye fades; below
    // the cull depth it is dropped entirely rather than drawn at zero opacity.
    const alpha = (projected.depth - rig.cullAtDepth) / (rig.fadeFromDepth - rig.cullAtDepth);
    if (alpha <= 0) continue;
    const [a, b, c, d, e, f] = projected.matrix;
    // The matrix columns are the capsule's own axes: `(a, b)` is its width direction
    // and `(c, d)` its length direction, each already scaled by the projection. The
    // capsule's long axis is local +y, so the rotation must send +y onto `(c, d)`.
    // SVG's `rotate(θ)` sends +y to `(−sin θ, cos θ)`, hence θ = atan2(−c, d). Using
    // the width axis `(a, b)` instead gives a different angle whenever the columns
    // are not orthogonal — exactly the pitch/tilt case, where the eye must lean.
    const angle = (Math.atan2(-c, d) * 180) / Math.PI;
    // Round the half-extent first and derive the full size from it: `width / 2` then
    // equals `rx` exactly in the emitted markup, which is the capsule invariant.
    const halfWidth = Number(Math.hypot(a, b).toFixed(3));
    const halfLength = Number(Math.hypot(c, d).toFixed(3));
    // The fit is where the pose is known: the same rig at rest cannot know how far a
    // turned gaze will push an eye towards a narrow cheek. The anchor is folded in
    // first because it is part of where the capsule is actually drawn; fitting before
    // adding it would let the anchor push the capsule back out by `|anchorY|`.
    const fitted = fitEyeToOutline(
      geometry.body.outline,
      e,
      f + anchorY,
      halfWidth,
      halfLength,
    );
    const cx = number(fitted.x);
    const cy = number(fitted.y);
    const opacity = alpha < 1 ? ` opacity="${alpha.toFixed(3)}"` : "";
    capsules +=
      `<g transform="translate(${cx},${cy}) rotate(${number(angle)})">` +
      `<rect x="${number(-halfWidth)}" y="${number(-halfLength)}"` +
      ` width="${number(halfWidth * 2)}" height="${number(halfLength * 2)}"` +
      ` rx="${number(halfWidth)}" fill="${escapeAttribute(geometry.ink.eyes)}"${opacity} />` +
      `</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(geometry.body.viewBox)}"` +
    ` width="${pixels}" height="${pixels}" aria-hidden="true">` +
    (working ? workingStyle(geometry, id) : "") +
    `<defs>${inkGradient(geometry, id)}</defs>` +
    // The nod and the turn wrap the animated body group rather than sharing it: the
    // working keyframes set `transform`, and a static transform on the same element
    // loses. A zero offset emits no group, so the un-nodding bytes stay as they were.
    (nodded ? `<g transform="translate(0,${nod})">` : "") +
    (turned ? `<g transform="rotate(${turn})">` : "") +
    `<g${working ? ` class="${id}-body"` : ""}>` +
    `<path d="${escapeAttribute(path)}" fill="url(#${id}-fill)" />` +
    // The eyes live inside the body group, so head motion carries them as it does today.
    `<g${working ? ` class="${id}-eyes"` : ""}>${capsules}</g>` +
    `</g>` +
    (turned ? `</g>` : "") +
    (nodded ? `</g>` : "") +
    `</svg>`
  );
}

/**
 * Renders geometry. The legacy `rect` rig deliberately folds the geometry back
 * into an equivalent spec and delegates: this step proves the geometry can
 * express today's avatar, not that the renderer has been rewritten. The sphere
 * rig has no spec equivalent, so it is drawn directly.
 *
 * The fold reconstructs the path from the body points (geometry is
 * self-sufficient), and takes the palette entry's id and name from the ink so
 * the gradient id matches the v1 render byte for byte.
 */
export function renderGeometry(geometry: AvatarGeometry, options: RenderOptions): string {
  const rig = geometry.rig;
  if (rig.kind === "sphere") return renderSphere(geometry, rig, options);

  const spec: AvatarSpec = {
    packId: geometry.packId,
    packVersion: geometry.packVersion,
    identity: geometry.identity,
    seed: geometry.seed,
    family: geometry.family,
    look: geometry.look,
    color: {
      id: geometry.ink.bodyId,
      name: geometry.ink.bodyName,
      light: geometry.ink.body,
      dark: geometry.ink.bodyHighlight,
      eye: geometry.ink.eyes,
    },
    surface: geometry.surface,
    path: outlinePath(geometry.body.outline, {
      phase: geometry.body.phase,
      smoothingPasses: geometry.body.smoothingPasses,
    }),
    eyes: rig.eyes,
    eyeRotation: rig.rotationDeg,
    durationMs: geometry.durationMs,
    motionAmplitude: geometry.motionAmplitude,
    clip: geometry.clip,
    viewBox: geometry.body.viewBox,
  };
  return renderSvg(spec, options);
}

export const svgRenderer: AvatarRenderer<string> = { render: renderSvg };
