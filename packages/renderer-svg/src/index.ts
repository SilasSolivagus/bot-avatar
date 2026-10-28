import { clipFrame, outlinePath, projectEye } from "@botavatar/engine";
import type { AvatarGeometry, AvatarSpec, ClipFrame, SphereEyeRig } from "@botavatar/engine";

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
 * Each eye is a capsule rect centred on the origin — the projection matrix already
 * carries its translation, its per-axis scale and the eye's own tilt.
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
  const eyePose = {
    ...geometry.pose,
    gaze: { ...geometry.pose.gaze, yaw: geometry.pose.gaze.yaw * (1 - coupling) },
  };

  let capsules = "";
  for (const index of [0, 1] as const) {
    const projected = projectEye(rig, eyePose, index);
    // Depth is the sphere normal's z. Between the two thresholds the eye fades; below
    // the cull depth it is dropped entirely rather than drawn at zero opacity.
    const alpha = (projected.depth - rig.cullAtDepth) / (rig.fadeFromDepth - rig.cullAtDepth);
    if (alpha <= 0) continue;
    const [a, b, c, d, e, f] = projected.matrix.map(number);
    const opacity = alpha < 1 ? ` opacity="${alpha.toFixed(3)}"` : "";
    // A unit capsule: the matrix already carries the half-extents, the tilt and the
    // centre, so the rect must not repeat them. `rx="1"` on a 2×2 rect is a full
    // semicircle end, which survives the anisotropic scale the projection applies.
    capsules +=
      `<rect x="-1" y="-1" width="2" height="2" rx="1"` +
      ` transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})"` +
      ` fill="${escapeAttribute(geometry.ink.eyes)}"${opacity} />`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(geometry.body.viewBox)}"` +
    ` width="${pixels}" height="${pixels}" aria-hidden="true">` +
    (working ? workingStyle(geometry, id) : "") +
    `<defs>${inkGradient(geometry, id)}</defs>` +
    // The turn wraps the animated body group rather than sharing it: the working
    // keyframes set `transform`, and a static transform on the same element loses.
    (turned ? `<g transform="rotate(${turn})">` : "") +
    `<g${working ? ` class="${id}-body"` : ""}>` +
    `<path d="${escapeAttribute(path)}" fill="url(#${id}-fill)" />` +
    // The eyes live inside the body group, so head motion carries them as it does today.
    `<g${working ? ` class="${id}-eyes"` : ""}>${capsules}</g>` +
    `</g>` +
    (turned ? `</g>` : "") +
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
