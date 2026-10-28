import { describe, expect, it } from "vitest";
import {
  avatarSampleIdentity,
  buildAvatarSpec,
  buildGeometry,
  normalizeRadii,
  projectEye,
  radiiShape,
  radiiToPath,
  radiusAtAngle,
  regularPolygonProfile,
  superellipseProfile,
  toGeometry,
} from "@botavatar/engine";
import type { SphereEyeRig, StylePack, Surface } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { fitEyeToOutline, renderGeometry, renderSvg } from "../src/index.js";

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
    // Part of the pitch goes to the head as a nod; the rest tilts the eyes on the sphere.
    bodyPitchFollow: 0.35,
    // Rest tilt is parallel: both eyes lean the same way, never mirrored.
    restTiltDeg: -4,
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
  interface Capsule {
    cx: number;
    cy: number;
    angle: number;
    rect: string;
    width: number;
    height: number;
    rx: number;
  }
  /**
   * Each eye is a `translate(cx,cy) rotate(angle)` group wrapping one rect drawn in
   * local space. Decomposing the group is what proves the rect is a true capsule:
   * its `rx` must stay half its width no matter how the projection foreshortens it.
   */
  const capsules = (svg: string): Capsule[] =>
    [
      ...svg.matchAll(
        /<g transform="translate\(([^,]+),([^)]+)\) rotate\(([^)]+)\)"><rect ([^>]*?)\s*\/><\/g>/g,
      ),
    ].map((match) => {
      const rect = match[4]!;
      return {
        cx: Number(match[1]),
        cy: Number(match[2]),
        angle: Number(match[3]),
        rect,
        width: Number(attribute(rect, "width")),
        height: Number(attribute(rect, "height")),
        rx: Number(attribute(rect, "rx")),
      };
    });
  const drawnWidth = (capsule: Capsule) => capsule.width;
  const drawnLength = (capsule: Capsule) => capsule.height;
  const gradientId = (svg: string) => svg.match(/<linearGradient id="([^"]+)"/)?.[1];

  it("draws one rotated capsule per eye, never a projection matrix on the rect", () => {
    const svg = renderGeometry(geometry, { size: 96 });
    expect(capsules(svg)).toHaveLength(2);
    // A matrix on the rect is what turned the capsule into an ellipse: its columns
    // squash the rounded ends. The rect must stay local and only the group rotates.
    expect(svg).not.toContain("matrix(");
    expect(svg).toContain('viewBox="-60 -60 120 120"');
    expect(svg).toContain('width="96"');
    expect(svg).toContain('height="96"');
  });

  it("draws each capsule at the projection's half-extents, as a real capsule", () => {
    const drawn = capsules(renderGeometry(geometry, { size: 96 }));
    expect(drawn).toHaveLength(2);
    for (const capsule of drawn) {
      // The rect is centred in its own frame; the group carries the position and
      // rotation. `rx` is half the width, so the ends are semicircles, not corners.
      expect(capsule.width).toBeGreaterThan(0);
      expect(capsule.height).toBeGreaterThan(0);
      expect(Number(attribute(capsule.rect, "x"))).toBeCloseTo(-capsule.width / 2, 6);
      expect(Number(attribute(capsule.rect, "y"))).toBeCloseTo(-capsule.height / 2, 6);
      expect(capsule.rx).toBeCloseTo(capsule.width / 2, 6);
      expect(attribute(capsule.rect, "fill")).toBe(geometry.ink.eyes);
    }
    // What the rect actually occupies after the projection: an 8 × 25-ish capsule in a
    // 120 viewBox, the size of organic-blob's 7 × 24 rect eyes. The width is
    // foreshortened by the eye's lateral angle on the sphere.
    for (const [index, capsule] of drawn.entries()) {
      const eye = rig.eyes[index as 0 | 1];
      const lateral = (Math.abs(eye.lateralDeg) * Math.PI) / 180;
      expect(drawnWidth(capsule)).toBeCloseTo(2 * eye.halfWidth * Math.cos(lateral), 1);
      expect(drawnLength(capsule)).toBeCloseTo(2 * eye.halfHeight, 1);
    }
  });

  it("keeps rx at half the width at rest and when the far eye narrows", () => {
    for (const yaw of [0, 30]) {
      const drawn = capsules(looking(yaw));
      for (const capsule of drawn) {
        expect(capsule.rx).toBeCloseTo(capsule.width / 2, 6);
      }
      if (yaw === 30) {
        // Positive yaw turns toward +x, where eye 1 sits; eye 1 becomes the far eye.
        const far = drawn[1]!;
        const near = drawn[0]!;
        expect(far.width).toBeLessThan(near.width);
      }
    }
  });

  it("narrows only the far eye at 40° of yaw, in both directions", () => {
    const widths = (yaw: number) =>
      capsules(
        renderGeometry(
          { ...geometry, pose: { gaze: { yaw, pitch: 0 }, lidOpen: 1 } },
          { size: 96 },
        ),
      ).map(drawnWidth);
    const rest = widths(0);
    // Positive yaw turns toward +x, where eye 1 sits: it is the far eye and narrows,
    // while the near eye only foreshortens by cos(40° − lateral) / cos(lateral).
    for (const [yaw, far] of [[40, 1], [-40, 0]] as const) {
      const near = far === 0 ? 1 : 0;
      const turned = widths(yaw);
      expect(turned[far]!).toBeLessThan(rest[far]! * 0.65);
      expect(turned[near]!).toBeGreaterThan(rest[near]! * 0.95);
    }
  });

  it("narrows the far eye when the gaze turns", () => {
    const widths = (yaw: number) => capsules(looking(yaw)).map(drawnWidth);
    const still = widths(0);
    const turned = widths(25);
    // Positive yaw turns toward +x, where eye 1 sits: it becomes the far eye and
    // narrows, while eye 0 comes toward the viewer and widens.
    expect(turned[1]!).toBeLessThan(still[1]!);
    expect(turned[0]!).toBeGreaterThan(still[0]!);
    expect(turned[1]!).toBeLessThan(turned[0]!);
  });

  it("squashes the capsules vertically when the lid closes", () => {
    const still = capsules(renderGeometry(geometry, { size: 96 }));
    const shut = capsules(
      renderGeometry(
        { ...geometry, pose: { ...geometry.pose, lidOpen: 0.25 } },
        { size: 96 },
      ),
    );
    for (const index of [0, 1] as const) {
      expect(shut[index]!.width).toBeCloseTo(still[index]!.width, 6);
      expect(shut[index]!.height).toBeCloseTo(still[index]!.height * 0.25, 2);
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
    const eyes = working.match(/<g class="[^"]*-eyes">(.*)<\/g><\/g>/)?.[1] ?? "";
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

  it("emits no head wrapper when the computed turn and nod are zero", () => {
    // Coupling zero is today's output; coupling anything at rest is rest too. Neither
    // may grow a wrapper group, or the un-coupled bytes would change. The eyes always
    // carry their own translate+rotate groups, so the wrapper check is specific.
    for (const svg of [coupled(0, 40), coupled(0.5, 0), coupled(1, 0)]) {
      expect(svg).not.toMatch(/<g transform="rotate\(/);
      expect(svg).not.toMatch(/<g transform="translate\(0,/);
    }
  });

  it("puts the coupled share of the same total yaw on the group", () => {
    expect(coupled(0.5, 40)).toContain('<g transform="rotate(20)">');
    expect(coupled(1, 40)).toContain('<g transform="rotate(40)">');
    expect(coupled(0.5, -40)).toContain('<g transform="rotate(-20)">');
  });

  it("does not turn the eyes twice: the projection uses the reduced yaw", () => {
    // The head carries 20 and the projection carries 20. If the projection kept the
    // full 40, these capsules would equal coupled(0, 40) instead.
    expect(capsules(coupled(0.5, 40))).toEqual(capsules(coupled(0, 20)));
  });

  it("leaves the eyes at rest when the head carries the whole turn", () => {
    expect(capsules(coupled(1, 40))).toEqual(capsules(coupled(0, 0)));
  });

  it("projects the near eye at the reduced yaw, not the full one", () => {
    // Width belongs to the projection frame, so splitting the turn between head and
    // eyes changes it; what must stay put is the total. The double-turn bug — project
    // the full yaw and still rotate the body — would leave the width at yaw 40.
    const widthAt = (svg: string) => capsules(svg)[0]!.width;
    expect(widthAt(coupled(0.5, 40))).toBeCloseTo(widthAt(coupled(0, 20)), 6);
    expect(widthAt(coupled(1, 40))).toBeCloseTo(widthAt(coupled(0, 0)), 6);
    // At 20° the near eye faces the viewer more squarely than at 40°, so the correct
    // split widens it a little. A full-yaw projection would keep it at the 40° width.
    expect(widthAt(coupled(0.5, 40))).toBeGreaterThan(widthAt(coupled(0, 40)));
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

  /** The same geometry at a chosen pitch and body-pitch coupling, rendered idle. */
  const pitched = (bodyPitchFollow: number, pitch: number) =>
    renderGeometry(
      {
        ...geometry,
        rig: { ...rig, bodyPitchFollow },
        pose: { gaze: { yaw: 0, pitch }, lidOpen: 1 },
      },
      { size: 96 },
    );

  it("nods the head with pitch and leaves only the remainder to the eyes", () => {
    const svg = pitched(0.35, 20);
    // −20 × 0.35 × 0.6 = −4.2: the head goes up, then the eyes only need 13°.
    expect(svg).toContain('<g transform="translate(0,-4.2)">');
    expect(capsules(svg)).toEqual(capsules(pitched(0, 13)));
  });

  it("emits no nod group when nothing of the pitch is given to the head", () => {
    for (const follow of [0, 0.00001]) {
      // 0 is the legacy pack; 0.00001 × 20 × 0.6 rounds to −0.000, which must not
      // grow an empty-looking wrapper either.
      expect(pitched(follow, 20)).not.toMatch(/<g transform="translate\(0,/);
    }
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
    // Positive yaw makes eye 1 the far one. Its opacity is exactly the projection's
    // depth mapped through the rig's fade band; the near eye stays fully opaque.
    const elements = rects(looking(68));
    expect(elements).toHaveLength(2);
    expect(attribute(elements[0]!, "opacity")).toBe("");
    expect(attribute(elements[1]!, "opacity")).not.toBe("");
    const projected = projectEye(rig, { gaze: { yaw: 68, pitch: 0 }, lidOpen: 1 }, 1);
    const alpha = (projected.depth - rig.cullAtDepth) / (rig.fadeFromDepth - rig.cullAtDepth);
    expect(Number(attribute(elements[1]!, "opacity"))).toBeCloseTo(alpha, 3);
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

  describe("surface eye paint", () => {
    const surfaceGeometry = { ...geometry, rig: { ...rig, eyePaint: "surface" as const } };

    it("fills the capsules with the surface colour and strokes them with it", () => {
      const drawn = capsules(renderGeometry(surfaceGeometry, { size: 96, surfaceColour: "#0B0B0C" }));
      expect(drawn).toHaveLength(2);
      for (const capsule of drawn) {
        expect(attribute(capsule.rect, "fill")).toBe("#0B0B0C");
        expect(attribute(capsule.rect, "stroke")).toBe("#0B0B0C");
        // 8% of the capsule's short axis (its drawn width), floored at 0.5 viewBox units.
        const strokeWidth = Number(attribute(capsule.rect, "stroke-width"));
        expect(strokeWidth).toBeCloseTo(Math.max(0.5, capsule.width * 0.08), 2);
        expect(strokeWidth).toBeGreaterThanOrEqual(0.5);
      }
    });

    it("floors the stroke at 0.5 viewBox units for a tiny capsule", () => {
      const tiny = {
        ...surfaceGeometry,
        rig: {
          ...surfaceGeometry.rig,
          eyes: [
            { ...surfaceGeometry.rig.eyes[0], halfWidth: 1 },
            { ...surfaceGeometry.rig.eyes[1], halfWidth: 1 },
          ] as SphereEyeRig["eyes"],
        },
      };
      const drawn = capsules(renderGeometry(tiny, { size: 96, surfaceColour: "#0B0B0C" }));
      for (const capsule of drawn) {
        // 8% of ~1.9 would be ~0.15; the floor wins.
        expect(attribute(capsule.rect, "stroke-width")).toBe("0.5");
      }
    });

    it("throws when the surface colour is missing, naming the option", () => {
      expect(() => renderGeometry(surfaceGeometry, { size: 96 })).toThrow(/surfaceColour/);
      expect(() => renderGeometry(surfaceGeometry, { size: 96, surfaceColour: "" })).toThrow(
        /surfaceColour/,
      );
    });

    it("keeps explicit ink paint byte-identical to the default and adds no stroke", () => {
      const ink = { ...geometry, rig: { ...rig, eyePaint: "ink" as const } };
      for (const size of [48, 96]) {
        // The default (no `eyePaint`) is the bytes before this change.
        expect(renderGeometry(ink, { size })).toBe(renderGeometry(geometry, { size }));
        // A surface colour supplied to an ink pack is ignored, stroke included.
        expect(renderGeometry(ink, { size, surfaceColour: "#0B0B0C" })).toBe(
          renderGeometry(geometry, { size }),
        );
      }
      expect(renderGeometry(ink, { size: 96, surfaceColour: "#0B0B0C" })).not.toContain("stroke=");
    });
  });

  it("still renders a rect rig byte for byte as before", () => {
    const rectSpec = buildAvatarSpec(organicBlob, "alice");
    expect(renderGeometry(buildGeometry(organicBlob, "alice"), { size: 96 })).toBe(
      renderSvg(rectSpec, { size: 96 }),
    );
  });
});


describe("fitEyeToOutline", () => {
  /** A rectangle 40 wide and 80 tall: the narrowest frontal radius is 20. */
  const body: ReadonlyArray<readonly [number, number]> = [
    [-20, -40],
    [20, -40],
    [20, 40],
    [-20, 40],
  ];

  it("leaves an eye that already fits exactly where the projection put it", () => {
    expect(fitEyeToOutline(body, 6, 0, 4, 10)).toEqual({ x: 6, y: 0, clamped: false });
  });

  it("pulls an escaping eye back to the room, along its own direction", () => {
    const halfWidth = 4;
    const halfLength = 10;
    const fitted = fitEyeToOutline(body, 30, 0, halfWidth, halfLength);
    expect(fitted.clamped).toBe(true);
    const distance = Math.hypot(fitted.x, fitted.y);
    // The room is the silhouette radius at that angle, less the capsule's bounding
    // half-extent and the 2.5-unit margin.
    expect(distance).toBeCloseTo(radiusAtAngle(body, 0) - (10 + 2.5), 6);
    expect(distance).toBeLessThan(30);
    expect(Math.atan2(fitted.y, fitted.x)).toBeCloseTo(0, 9);
  });

  it("keeps the outermost point inside the outline", () => {
    const outline: ReadonlyArray<readonly [number, number]> = [
      [-46, -46],
      [46, -46],
      [46, 46],
      [-46, 46],
    ];
    const fitted = fitEyeToOutline(outline, 40, -40, 5, 12);
    const outer = Math.hypot(fitted.x, fitted.y) + 12;
    expect(outer).toBeLessThanOrEqual(radiusAtAngle(outline, Math.atan2(fitted.y, fitted.x)));
  });

  it("parks an eye at the centre when the outline has no room at all", () => {
    const diamond: ReadonlyArray<readonly [number, number]> = [
      [-5, 0],
      [0, 5],
      [5, 0],
      [0, -5],
    ];
    const fitted = fitEyeToOutline(diamond, 10, 0, 3, 3);
    expect(fitted).toEqual({ x: 0, y: 0, clamped: true });
  });
});

/**
 * A sphere pack whose bodies are radius profiles. The sphere branch must draw the
 * profile itself: feeding `radiiToPoints` through the v1 outline pipeline would add
 * the per-identity phase distortion and two Chaikin passes, which is exactly the
 * hand-drawn model the profiles replaced.
 */
describe("sphere rig with radii families", () => {
  const radiusOrb = {
    ...organicBlob,
    id: "radius-orb",
    name: "Radius Orb",
    version: "0.1.0",
    shapes: [
      radiiShape(normalizeRadii(regularPolygonProfile(6, 1.04, 0.26, 0), 46)),
      radiiShape(normalizeRadii(superellipseProfile(4.2), 46 * 1.15)),
    ],
    eyes: (orbPack as unknown as StylePack).eyes,
    motion: {
      durationMsByFamily: [1800, 1800],
      amplitude: 1,
      clipByFamily: ["breathe", "breathe"] as const,
    },
  } as unknown as StylePack;

  it("draws each profile directly, with no phase distortion or smoothing", () => {
    for (const family of [0, 1] as const) {
      const geometry = buildGeometry(radiusOrb, avatarSampleIdentity(radiusOrb, family));
      expect(geometry.family).toBe(family);
      const radii = radiusOrb.shapes[family]!.radii!;
      const svg = renderGeometry(geometry, { size: 96 });
      expect(svg).toContain(`d="${radiiToPath(radii)}"`);
    }
  });

  it("still derives the eyes from the same profile", () => {
    const geometry = buildGeometry(radiusOrb, avatarSampleIdentity(radiusOrb, 0));
    if (geometry.rig.kind !== "sphere") throw new Error("expected a sphere rig");
    expect(geometry.rig.eyes[0].halfWidth).toBeGreaterThan(0);
    expect(geometry.rig.eyes[0].lateralDeg).toBeCloseTo(-geometry.rig.eyes[1].lateralDeg, 6);
    const svg = renderGeometry(geometry, { size: 96 });
    expect(svg).not.toContain("NaN");
  });
});

/** The rect-eye fold must honor a profile too; only the legacy `outline` keeps v1. */
describe("radii families with rect eyes", () => {
  const radii = normalizeRadii(superellipseProfile(4.2), 46 * 1.15);
  const pack = {
    ...organicBlob,
    id: "radius-rect",
    name: "Radius Rect",
    version: "0.1.0",
    shapes: [radiiShape(radii)],
  } as unknown as StylePack;

  it("renders the profile path instead of the smoothed derived polygon", () => {
    const geometry = buildGeometry(pack, avatarSampleIdentity(pack, 0));
    expect(geometry.rig.kind).toBe("rect");
    const svg = renderGeometry(geometry, { size: 96 });
    expect(svg).toContain(`d="${radiiToPath(radii)}"`);
  });
});
