import { describe, expect, it } from "vitest";
import { buildAvatarSpec, buildGeometry, toGeometry } from "@botavatar/engine";
import type { SphereEyeRig, Surface } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderGeometry, renderSvg } from "../src/index.js";

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

describe("element ids", () => {
  it("gives two colours of the same identity their own gradient", () => {
    const base = buildAvatarSpec(organicBlob, "shared-identity");
    const other = {
      ...base,
      color: { id: "ink", name: "Ink", light: "#26262C", dark: "#0A0A0C", eye: "#F2F2F5" },
    };
    const first = renderSvg(base, { size: 48 });
    const second = renderSvg(other, { size: 48 });
    const idOf = (svg: string) => svg.match(/linearGradient id="([^"]+)"/)?.[1];
    expect(idOf(first)).toBeDefined();
    expect(idOf(second)).toBeDefined();
    expect(idOf(first)).not.toBe(idOf(second));
    expect(first).toContain(`fill="url(#${idOf(first)})"`);
    expect(second).toContain(`fill="url(#${idOf(second)})"`);
  });
});

describe("renderGeometry", () => {
  it("matches renderSvg byte for byte for a legacy rig", () => {
    for (const identity of ["alice", "bob", "张三", "wall-3-0"]) {
      const spec = buildAvatarSpec(organicBlob, identity);
      for (const state of ["idle", "working"] as const) {
        for (const size of [32, 96, 160]) {
          expect(renderGeometry(toGeometry(organicBlob, spec), { size, state })).toBe(
            renderSvg(spec, { size, state }),
          );
        }
      }
    }
  });

  it("matches renderSvg byte for byte for a surfaced spec", () => {
    const base = buildAvatarSpec(organicBlob, "alice");
    const surfaces: Surface[] = [
      {
        stops: [
          { offset: 0, color: "#FFFFFF" },
          { offset: 0.5, color: "#FF9F43" },
          { offset: 1, color: "#C2410C" },
        ],
        highlight: { cx: -20, cy: -18, r: 14, opacity: 0.55 },
        shadow: { dx: 0, dy: 4, blur: 6, color: "#000000" },
      },
      { texture: { kind: "grain", opacity: 0.1 } },
    ];
    for (const surface of surfaces) {
      const spec = { ...base, surface };
      for (const state of ["idle", "working"] as const) {
        expect(renderGeometry(toGeometry(organicBlob, spec), { size: 96, state })).toBe(
          renderSvg(spec, { size: 96, state }),
        );
      }
    }
  });

});

/** The plan's orb pack: organic-blob's body and palette, sphere eyes, no v1 `rotation`. */
const orbPack = {
  ...organicBlob,
  id: "orb",
  name: "Orb",
  version: "0.1.0",
  eyes: {
    kind: "sphere",
    sphereRadius: 44,
    eyes: [
      { lateralDeg: 18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: -6 },
      { lateralDeg: -18, verticalDeg: 0, halfWidth: 4.2, halfHeight: 12.5, tiltDeg: 6 },
    ],
    fadeFromDepth: 0.12,
    cullAtDepth: 0.02,
    // The gallery's value. The renderer must not assume a default, and the existing
    // sphere assertions predate the split, so the fixture starts un-coupled.
    bodyCoupling: 0,
  },
} as never;

describe("sphere rig", () => {
  const geometry = buildGeometry(orbPack, "alice");
  const rig: SphereEyeRig = (() => {
    if (geometry.rig.kind !== "sphere") throw new Error("the orb pack must build a sphere rig");
    return geometry.rig;
  })();

  /** The attributes of every `<rect>` the sphere branch draws (the eyes). */
  const rects = (svg: string) =>
    [...svg.matchAll(/<rect ([^>]*?)\s*\/>/g)].map((match) => match[1]!);
  const attribute = (element: string, name: string) =>
    new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(element)?.[1] ?? "";
  const matrix = (element: string) =>
    attribute(element, "transform")
      .slice("matrix(".length, -1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);
  /**
   * The matrix columns are the capsule's own axes: the first is its width, the second
   * its length, each already scaled by the projection. The drawn rect is unit-sized.
   */
  const width = (values: readonly number[]) => Math.hypot(values[0]!, values[1]!);
  const height = (values: readonly number[]) => Math.hypot(values[2]!, values[3]!);
  const drawnWidth = (element: string) => 2 * width(matrix(element));
  const drawnLength = (element: string) => 2 * height(matrix(element));
  const gradientId = (svg: string) => svg.match(/<linearGradient id="([^"]+)"/)?.[1];

  it("draws one capsule per eye with a projection matrix", () => {
    const svg = renderGeometry(geometry, { size: 96 });
    const capsules = svg.match(/<rect[^>]*rx="[^"]*"[^>]*transform="matrix\(/g) ?? [];
    expect(capsules).toHaveLength(2);
    expect(svg).toContain('viewBox="-60 -60 120 120"');
    expect(svg).toContain('width="96"');
    expect(svg).toContain('height="96"');
  });

  it("draws the capsule at the rig's size, with the projection matrix carrying the scale", () => {
    const drawnRects = rects(renderGeometry(geometry, { size: 96 }));
    expect(drawnRects).toHaveLength(2);
    for (const capsule of drawnRects) {
      // The rect is a unit capsule in its own frame: matrix() already carries the
      // position, the per-axis scale and the tilt. Drawing it at ±halfWidth applied
      // the scale a second time and made every eye four times too large.
      expect(attribute(capsule, "x")).toBe("-1");
      expect(attribute(capsule, "y")).toBe("-1");
      expect(attribute(capsule, "width")).toBe("2");
      expect(attribute(capsule, "height")).toBe("2");
      expect(attribute(capsule, "rx")).toBe("1");
      expect(attribute(capsule, "fill")).toBe(geometry.ink.eyes);
    }
    // What the rect actually occupies after the transform: an 8 × 25 capsule in a
    // 120 viewBox, the size of organic-blob's 7 × 24 rect eyes. The width is
    // foreshortened by the eye's lateral angle — that is what the projection is for.
    for (const [index, capsule] of drawnRects.entries()) {
      const eye = rig.eyes[index as 0 | 1];
      const lateral = (Math.abs(eye.lateralDeg) * Math.PI) / 180;
      expect(drawnWidth(capsule)).toBeCloseTo(2 * eye.halfWidth * Math.cos(lateral), 1);
      expect(drawnLength(capsule)).toBeCloseTo(2 * eye.halfHeight, 1);
    }
  });

  it("narrows only the far eye at 40° of yaw, in both directions", () => {
    const widths = (yaw: number) =>
      rects(
        renderGeometry(
          { ...geometry, pose: { gaze: { yaw, pitch: 0 }, lidOpen: 1 } },
          { size: 96 },
        ),
      ).map(drawnWidth);
    const rest = widths(0);
    // Positive yaw turns toward +x, where eye 1 sits: it is the far eye and narrows,
    // while the near eye only foreshortens by cos(40° − 18°) / cos(18°) ≈ 2.5%.
    for (const [yaw, far] of [[40, 1], [-40, 0]] as const) {
      const near = far === 0 ? 1 : 0;
      const turned = widths(yaw);
      expect(turned[far]!).toBeLessThan(rest[far]! * 0.65);
      expect(turned[near]!).toBeGreaterThan(rest[near]! * 0.95);
    }
  });

  it("narrows the far eye when the gaze turns", () => {
    const still = rects(renderGeometry(geometry, { size: 96 })).map(matrix);
    const turned = rects(
      renderGeometry(
        { ...geometry, pose: { gaze: { yaw: 25, pitch: 0 }, lidOpen: 1 } },
        { size: 96 },
      ),
    ).map(matrix);
    // Positive yaw turns toward +x, where eye 1 sits: it becomes the far eye and
    // narrows, while eye 0 swings toward the viewer and widens (until 2×lateral,
    // past which even the near eye starts to foreshorten).
    expect(width(turned[1]!)).toBeLessThan(width(still[1]!));
    expect(width(turned[0]!)).toBeGreaterThan(width(still[0]!));
    expect(width(turned[1]!)).toBeLessThan(width(turned[0]!));
  });

  it("squashes the capsules vertically when the lid closes", () => {
    const still = rects(renderGeometry(geometry, { size: 96 })).map(matrix);
    const shut = rects(
      renderGeometry(
        { ...geometry, pose: { ...geometry.pose, lidOpen: 0.25 } },
        { size: 96 },
      ),
    ).map(matrix);
    for (const index of [0, 1] as const) {
      expect(width(shut[index]!)).toBeCloseTo(width(still[index]!), 6);
      expect(height(shut[index]!)).toBeCloseTo(height(still[index]!) * 0.25, 2);
    }
  });

  it("paints the body from the ink colours with a gradient id that includes them", () => {
    const svg = renderGeometry(geometry, { size: 48 });
    expect(svg).toContain(`<stop offset="0%" stop-color="${geometry.ink.body}" />`);
    expect(svg).toContain(`<stop offset="100%" stop-color="${geometry.ink.bodyHighlight}" />`);
    expect(gradientId(svg)).toBeDefined();
    expect(svg).toContain(`fill="url(#${gradientId(svg)})"`);
    expect(svg).toContain(`fill="${geometry.ink.eyes}"`);
  });

  it("gives two eye colours of the same body their own gradient id", () => {
    const pink = { ...geometry, ink: { ...geometry.ink, eyes: "#FF00AA" } };
    expect(pink.ink.eyes).not.toBe(geometry.ink.eyes);
    const first = gradientId(renderGeometry(geometry, { size: 48 }));
    const second = gradientId(renderGeometry(pink, { size: 48 }));
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(renderGeometry(pink, { size: 48 })).toContain('fill="#FF00AA"');
  });

  it("refuses a sphere rig that declares surface material instead of rendering it flat", () => {
    const surfaced = {
      ...geometry,
      surface: {
        stops: [
          { offset: 0, color: "#FFFFFF" },
          { offset: 1, color: "#000000" },
        ],
      },
    };
    expect(() => renderGeometry(surfaced, { size: 96 })).toThrow(/surface material/i);
  });

  it("animates the body group and a separate eye group in the working state", () => {
    const idle = renderGeometry(geometry, { size: 96 });
    expect(idle).not.toContain("<style");
    expect(idle).not.toContain("class=");

    const working = renderGeometry(geometry, { size: 96, state: "working" });
    expect(working).toContain("<style>");
    expect(working).toContain(`${geometry.durationMs}ms`);
    expect(working).toMatch(/<g class="[^"]*-body">/);
    expect(working).toMatch(/<g class="[^"]*-eyes">/);
    // The eyes ride inside the body group, so head motion carries them.
    expect(working.indexOf("-body")).toBeLessThan(working.indexOf("-eyes"));
    const eyes = working.match(/<g class="[^"]*-eyes">(.*?)<\/g>/)?.[1] ?? "";
    expect((eyes.match(/<rect/g) ?? [])).toHaveLength(2);
  });

  /** The same geometry with a chosen body coupling and gaze yaw, rendered idle. */
  const coupled = (bodyCoupling: number, yaw: number) =>
    renderGeometry(
      {
        ...geometry,
        rig: { ...rig, bodyCoupling },
        pose: { gaze: { yaw, pitch: 0 }, lidOpen: 1 },
      },
      { size: 96 },
    );

  it("emits no rotate group when the computed turn is zero", () => {
    // Coupling zero is today's output; coupling anything at rest is rest too. Neither
    // may grow a wrapper group, or the un-coupled bytes would change.
    for (const svg of [coupled(0, 40), coupled(0.5, 0), coupled(1, 0)]) {
      expect(svg).not.toContain("rotate(");
      expect(svg).not.toContain("<g transform=");
    }
  });

  it("puts the coupled share of the same total yaw on the group", () => {
    expect(coupled(0.5, 40)).toContain('<g transform="rotate(20)">');
    expect(coupled(1, 40)).toContain('<g transform="rotate(40)">');
    expect(coupled(0.5, -40)).toContain('<g transform="rotate(-20)">');
  });

  it("does not turn the eyes twice: the projection uses the reduced yaw", () => {
    // The head carries 20 and the projection carries 20. If the projection kept the
    // full 40, these matrices would equal coupled(0, 40) instead.
    expect(matrix(rects(coupled(0.5, 40))[0]!)).toEqual(matrix(rects(coupled(0, 20))[0]!));
    expect(matrix(rects(coupled(0.5, 40))[1]!)).toEqual(matrix(rects(coupled(0, 20))[1]!));
  });

  it("leaves the eyes at rest when the head carries the whole turn", () => {
    expect(rects(coupled(1, 40)).map(matrix)).toEqual(rects(coupled(0, 0)).map(matrix));
  });

  it("projects the near eye at the reduced yaw, not the full one", () => {
    // Width belongs to the projection frame, so splitting the turn between head and
    // eyes changes it; what must stay put is the total. The double-turn bug — project
    // the full yaw and still rotate the body — would leave the width at yaw 40.
    expect(drawnWidth(rects(coupled(0.5, 40))[0]!)).toBeCloseTo(
      drawnWidth(rects(coupled(0, 20))[0]!),
      6,
    );
    expect(drawnWidth(rects(coupled(1, 40))[0]!)).toBeCloseTo(
      drawnWidth(rects(coupled(0, 0))[0]!),
      6,
    );
    // At 20° the near eye faces the viewer more squarely than at 40°, so the correct
    // split widens it a little. A full-yaw projection would keep it at the 40° width.
    expect(drawnWidth(rects(coupled(0.5, 40))[0]!)).toBeGreaterThan(
      drawnWidth(rects(coupled(0, 40))[0]!),
    );
  });

  it("clamps the coupling between 0 and 1, so a pack cannot over- or under-turn", () => {
    expect(coupled(1.4, 40)).toBe(coupled(1, 40));
    expect(coupled(-0.4, 40)).toBe(coupled(0, 40));
  });

  it("keeps the head turn outside the animated body group", () => {
    const working = renderGeometry(
      {
        ...geometry,
        rig: { ...rig, bodyCoupling: 0.5 },
        pose: { gaze: { yaw: 40, pitch: 0 }, lidOpen: 1 },
      },
      { size: 96, state: "working" },
    );
    // The body group's CSS animation owns its `transform`; a static transform on the
    // same element would be overwritten while working, so the turn needs its own group.
    expect(working).toMatch(/<g transform="rotate\(20\)"><g class="[^"]*-body">/);
  });

  /** The same geometry at a chosen gaze yaw, rendered idle. */
  const looking = (yaw: number) =>
    renderGeometry(
      { ...geometry, pose: { gaze: { yaw, pitch: 0 }, lidOpen: 1 } },
      { size: 96 },
    );

  it("keeps both eyes fully opaque while the far eye still faces the viewer", () => {
    const svg = looking(45);
    expect(rects(svg)).toHaveLength(2);
    // depth 0.454 at yaw 45 is well above fadeFromDepth, so alpha clamps to 1 and no
    // attribute is emitted at all: opacity="1" would be noise.
    expect(svg).not.toContain('opacity="');
  });

  it("fades the far eye only inside the rig's depth band", () => {
    // The far eye's normal is yaw + 18° from the viewer: 86° at yaw 68, depth 0.0698,
    // so alpha = (0.0698 − 0.02) / (0.12 − 0.02) = 0.498.
    const elements = rects(looking(68));
    expect(elements).toHaveLength(2);
    expect(attribute(elements[0]!, "opacity")).toBe("");
    expect(Number(attribute(elements[1]!, "opacity"))).toBeCloseTo(0.498, 3);
  });

  it("culls the far eye once its normal passes the cull depth", () => {
    // At yaw 85 the far normal is 103°, already behind the sphere, so the capsule is
    // dropped rather than drawn transparent. The near eye stays fully opaque.
    for (const yaw of [85, 95]) {
      const elements = rects(looking(yaw));
      expect(elements).toHaveLength(1);
      expect(attribute(elements[0]!, "opacity")).toBe("");
    }
  });

  it("still renders a rect rig byte for byte as before", () => {
    const rectSpec = buildAvatarSpec(organicBlob, "alice");
    expect(renderGeometry(buildGeometry(organicBlob, "alice"), { size: 96 })).toBe(
      renderSvg(rectSpec, { size: 96 }),
    );
  });
});
