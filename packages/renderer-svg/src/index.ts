import { clipFrame } from "@botavatar/engine";
import type { AvatarSpec, ClipFrame } from "@botavatar/engine";

export interface RenderOptions {
  size: number;
  state?: "idle" | "working";
}

export interface AvatarRenderer<Out> {
  render(spec: AvatarSpec, options: RenderOptions): Out;
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function gradientId(spec: AvatarSpec): string {
  // Derived from the spec, so two renders of one spec agree; sanitised, so a
  // pack id cannot break out of the attribute.
  return `av-${escapeAttribute(`${spec.packId}-${spec.seed}`)}`.replace(/[^A-Za-z0-9_-]/g, "-");
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

function keyframes(
  name: string,
  spec: AvatarSpec,
  transform: (frame: ClipFrame) => string,
): string {
  return `@keyframes ${name}{${FRAME_STEPS.map((progress) => {
    const frame = clipFrame(spec.clip, progress, spec.motionAmplitude);
    return `${number(progress * 100)}%{transform:${transform(frame)}}`;
  }).join("")}}`;
}

function workingStyle(spec: AvatarSpec, id: string): string {
  const body = `${id}-body`;
  const eyes = `${id}-eyes`;
  const timing = `${spec.durationMs}ms ease-in-out infinite`;
  return (
    `<style>` +
    keyframes(
      body,
      spec,
      (frame) =>
        `translate(0px, ${number(frame.translateY)}px) scale(${number(frame.scale)}) rotate(${number(frame.rotate)}deg)`,
    ) +
    keyframes(
      eyes,
      spec,
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

/** The ink gradient: the pack's material stops when it has any, otherwise light to dark. */
function fillDefs(spec: AvatarSpec, id: string): string {
  const stops = spec.surface?.stops;
  const ink = stops?.length
    ? stops
        .map(
          (stop) =>
            `<stop offset="${stop.offset * 100}%" stop-color="${escapeAttribute(stop.color)}" />`,
        )
        .join("")
    : `<stop offset="0%" stop-color="${escapeAttribute(spec.color.light)}" />` +
      `<stop offset="100%" stop-color="${escapeAttribute(spec.color.dark)}" />`;
  return `<linearGradient id="${id}-fill" x1="0" y1="0" x2="1" y2="1">${ink}</linearGradient>`;
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
  const id = gradientId(spec);
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

export const svgRenderer: AvatarRenderer<string> = { render: renderSvg };
