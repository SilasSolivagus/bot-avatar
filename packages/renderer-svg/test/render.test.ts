import { describe, expect, it } from "vitest";
import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "../src/index.js";

const spec = buildAvatarSpec(organicBlob, "bot_123");

describe("renderSvg", () => {
  it("emits one svg element with the spec's viewport and the requested size", () => {
    const svg = renderSvg(spec, { size: 128 });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg).toContain('viewBox="-60 -60 120 120"');
    expect(svg).toContain('width="128"');
    expect(svg).toContain('height="128"');
  });

  it("draws the spec's path and eyes without recomputing them", () => {
    const svg = renderSvg(spec, { size: 48 });
    expect(svg).toContain(`d="${spec.path}"`);
    expect(svg).toContain(`<g transform="rotate(${spec.eyeRotation})"`);
    expect(svg.match(/<rect/g)).toHaveLength(2);
    expect(svg).toContain(`fill="${spec.color.eye}"`);
  });

  it("paints the body with a gradient built from the palette entry", () => {
    const svg = renderSvg(spec, { size: 48 });
    expect(svg).toContain(spec.color.light);
    expect(svg).toContain(spec.color.dark);
    expect(svg).toMatch(/fill="url\(#[A-Za-z0-9_-]+\)"/);
  });

  it("is byte-identical for repeated renders of the same spec", () => {
    expect(renderSvg(spec, { size: 64 })).toBe(renderSvg(spec, { size: 64 }));
  });

  it("differs between specs", () => {
    const other = buildAvatarSpec(organicBlob, "research");
    expect(renderSvg(spec, { size: 64 })).not.toBe(renderSvg(other, { size: 64 }));
  });

  it("adds a finite animation only in the working state", () => {
    const idle = renderSvg(spec, { size: 64, state: "idle" });
    const working = renderSvg(spec, { size: 64, state: "working" });
    expect(idle).not.toContain("<style");
    expect(working).toContain("<style");
    expect(working).toContain(`${spec.durationMs}ms`);
  });

  it("animates the body and a separate eye group inside the static eye tilt", () => {
    const blink = renderSvg({ ...spec, clip: "blink" }, { size: 64, state: "working" });
    expect(blink).toContain("scaleY(");
    expect(blink).toMatch(/class="[^"]*-eyes"/);
    expect(blink).toContain("transform-box: fill-box");
    expect(blink).toContain("transform-origin: center");

    const look = renderSvg({ ...spec, clip: "look-round" }, { size: 64, state: "working" });
    expect(look).toContain("translate(5px, 0px)");
    expect(look).toContain("translate(-5px, 0px)");

    // The static tilt stays on the outer group; the eyes animate on an inner one.
    expect(look).toMatch(
      new RegExp(
        `<g transform="rotate\\(${spec.eyeRotation}\\)" fill="[^"]*"><g class="[^"]*-eyes">`,
      ),
    );
  });

  it("samples quarter points, so clips that are neutral at the midpoint still move", () => {
    const working = renderSvg({ ...spec, clip: "shake" }, { size: 64, state: "working" });
    expect(working).toContain("25%{transform:");
    expect(working).toContain("50%{transform:");
    expect(working).toContain("75%{transform:");
  });

  it("scales the emitted keyframes with the spec's motionAmplitude", () => {
    const full = renderSvg({ ...spec, clip: "bob", motionAmplitude: 1 }, {
      size: 64,
      state: "working",
    });
    const half = renderSvg({ ...spec, clip: "bob", motionAmplitude: 0.5 }, {
      size: 64,
      state: "working",
    });
    expect(full).not.toBe(half);
    expect(full).toContain("translate(0px, -5px)");
    expect(half).toContain("translate(0px, -2.5px)");
  });

  it("defaults to the idle state and rounds a fractional size", () => {
    expect(renderSvg(spec, { size: 64 })).toBe(renderSvg(spec, { size: 64, state: "idle" }));
    expect(renderSvg(spec, { size: 31.6 })).toContain('width="32"');
  });

  it("escapes nothing it cannot escape: rejects a hostile identity in an attribute", () => {
    const hostile = buildAvatarSpec(organicBlob, '" onload="alert(1)');
    const svg = renderSvg(hostile, { size: 32 });
    expect(svg).not.toContain("onload=");
  });

  it("adds no material markup when the spec has no surface", () => {
    const svg = renderSvg(spec, { size: 64 });
    expect(svg).not.toContain("feDropShadow");
    expect(svg).not.toContain("feTurbulence");
    expect(svg).not.toContain("<ellipse");
    expect(svg.match(/<stop/g)).toHaveLength(2);
  });

  it("renders the material a skeuomorphic pack describes", () => {
    const clay = {
      ...spec,
      surface: {
        stops: [
          { offset: 0, color: "#FFFFFF" },
          { offset: 0.5, color: "#FF9F43" },
          { offset: 1, color: "#C2410C" },
        ],
        highlight: { cx: -20, cy: -18, r: 14, opacity: 0.55 },
        shadow: { dx: 0, dy: 4, blur: 6, color: "#000000" },
        texture: { kind: "grain" as const, opacity: 0.12 },
      },
    };
    const svg = renderSvg(clay, { size: 64 });
    expect(svg).toContain('offset="50%" stop-color="#FF9F43"');
    expect(svg).toContain("#C2410C");
    expect(svg).toContain("feDropShadow");
    expect(svg).toContain("feTurbulence");
    expect(svg).toContain('fill="url(#av-organic-blob-');
    expect(svg).toContain("<ellipse");

    const clip = svg.match(/<clipPath id="([^"]+)">(.*?)<\/clipPath>/);
    expect(clip).not.toBeNull();
    const clipId = clip![1]!;
    expect(clip![2]).toContain(`<path d="${spec.path}" />`);

    const grain = svg.match(/<rect [^>]*filter="url\(#[A-Za-z0-9_-]+-grain\)"[^>]*\/>/);
    expect(grain).not.toBeNull();
    expect(grain![0]).toContain(`clip-path="url(#${clipId})"`);

    const shine = svg.match(/<ellipse [^>]*fill="url\(#[A-Za-z0-9_-]+-shine\)"[^>]*\/>/);
    expect(shine).not.toBeNull();
    expect(shine![0]).toContain(`clip-path="url(#${clipId})"`);
  });
});
