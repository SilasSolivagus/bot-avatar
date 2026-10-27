import type { AvatarSpec } from "@botavatar/engine";

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

function workingStyle(spec: AvatarSpec, id: string): string {
  return (
    `<style>@keyframes ${id}-work{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}` +
    `.${id}-body{transform-origin:center;animation:${id}-work ${spec.durationMs}ms ease-in-out infinite}` +
    `@media (prefers-reduced-motion: reduce){.${id}-body{animation:none}}</style>`
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
    shape: `<ellipse cx="${shine.cx}" cy="${shine.cy}" rx="${shine.r}" ry="${shine.r}" fill="url(#${id}-shine)" />`,
  };
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
    ` filter="url(#${id}-grain)" opacity="${texture.opacity}" />`
  );
}

/** Renders a spec to a standalone SVG string. No DOM, no globals. */
export function renderSvg(spec: AvatarSpec, { size, state = "idle" }: RenderOptions): string {
  const pixels = Math.max(1, Math.round(size));
  const id = gradientId(spec);
  const working = state === "working";
  const shine = highlight(spec, id);
  const shadowed = spec.surface?.shadow ? ` filter="url(#${id}-shadow)"` : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttribute(spec.viewBox)}"` +
    ` width="${pixels}" height="${pixels}" aria-hidden="true">` +
    (working ? workingStyle(spec, id) : "") +
    `<defs>${fillDefs(spec, id)}${shine.defs}${shadowDefs(spec, id)}</defs>` +
    `<g${working ? ` class="${id}-body"` : ""}${shadowed}>` +
    `<path d="${escapeAttribute(spec.path)}" fill="url(#${id}-fill)" />` +
    shine.shape +
    `<g transform="rotate(${spec.eyeRotation})" fill="${escapeAttribute(spec.color.eye)}">` +
    eyeMarkup(spec) +
    `</g></g>` +
    grainMarkup(spec, id) +
    `</svg>`
  );
}

export const svgRenderer: AvatarRenderer<string> = { render: renderSvg };
