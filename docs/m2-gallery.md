# M2 — gallery, PNG and motion clips

M2 makes the avatars judgeable by eye, gives the service a second encoding, and replaces the single
scale pulse with eight motion clips. This file records what shipped, the one §12 acceptance criterion
that was replaced and the arithmetic behind that decision, and the evidence that a PNG is the same
avatar as the SVG.

Provenance: unless a line says otherwise, every number below comes from a run on this machine or from
the shipped code, checked on 2026-10-27 (MacBook Air, Apple M4, macOS 26.2, Node v22.23.4, pnpm
10.33.2). The **Task 6 record** column in the pixel table is quoted from evidence recorded earlier the
same day in `.superpowers/sdd/2026-10-27-m2-gallery/task-6-7-report.md`; it is not presented as
today's measurement.

## The gallery

`pnpm gallery` (or `pnpm --filter @botavatar/gallery dev`) starts Vite at `http://localhost:5173/`.
The app imports `@botavatar/engine`, the pack and the renderer directly: no service, no fetch, no
server-side rendering. The dev server alone is enough to browse every pack and identity. The one
service-shaped action is the PNG link, and the gallery never rasterises it locally.

### The four regions

| Region | What it is for | URL parameters it reads or writes |
| --- | --- | --- |
| **Pack switcher** | A `<select>` over the built-in pack plus every module under `src/packs/`. Changing it re-renders the wall without a page reload and resets `ids` to that pack's balanced wall. | writes `pack` |
| **Identity input** | A text field (Enter or **Add**) and five sample buttons. Samples come from `avatarSampleIdentity` for the first five assignable looks. A new identity is appended to the wall and selected in the detail card. | writes `ids` |
| **Comparison wall** | The identities in `ids` (40 by default, at most 60), each captioned `#family · look #look · colour`, plus a balance banner. Clicking a cell selects it. The strip below the wall renders one identity per assignable look and reports its distinctness. | reads `ids`, `size` |
| **Detail card** | The selected avatar at detail size, its `AvatarSpec` as JSON, **Copy SVG**, **Download SVG**, **Download PNG** and an `idle` / `working` toggle. The PNG link is enabled only when an `http(s)` service base is configured. | reads `size`, `service` |

`ids` is not just a filter: the banner and the strip measure the identities in the URL. The default
40-identity wall is balanced by construction (`wallIdentities`), but a hand-written `?ids=` list can
be unbalanced, and then the banner says so instead of hiding it.

### URL state

A view is a pure function of the query string, so a copied link restores the same wall. Writes go
through `history.replaceState`, and `popstate` re-reads the URL.

| Parameter | Form | Meaning |
| --- | --- | --- |
| `pack` | pack id | The style pack. Missing or unknown falls back to the first known pack (`organic-blob`). |
| `ids` | comma-separated identities | Trimmed, de-duplicated, empty entries dropped, capped at 60. Missing or empty means the pack's balanced wall of 40. |
| `size` | integer | Cell size, 48–512, default 160. An invalid value falls back to 160 instead of producing `NaN`. The strip clamps its own cells to 64–128. |
| `service` | `http(s)` base | Optional service base for the **Download PNG** link, for example `http://127.0.0.1:8787`. It is kept outside `WallState` so it survives pack and identity changes. |

Example: `/?pack=organic-blob&ids=alice,bob&size=160`. `formatWallState` uses `encodeURIComponent`,
so a space round-trips as `%20` rather than `+`.

## A criterion that could not pass, and what replaced it

§12 of the spec asked for the gallery wall: “对照墙 40 个身份中，`look` 重复率 < 25%” — among 40
identities on the wall, the `look` duplicate rate must be below 25%, to validate the assignment
strategy. The shipped pack cannot satisfy that, and the impossibility is arithmetic, not a bug.

The pack has ten bodies but **eight assignable looks**: families 0–5, 7 and 9 are assignable; family 6
is reserved (`HEART_FAMILY`); family 8 declares `look: 2` and therefore shares look 2 with family 2.
`avatarAssignableLooks` returned `[0, 1, 2, 3, 4, 5, 7, 9]` when measured today, and the gallery
header shows `8 looks`.

By pigeonhole, any set of `N` identities contains at most 8 distinct looks, so at least `N − 8` of
them repeat a look and the duplicate rate `(N − distinct) / N` is at least `(N − 8) / N`. For the
required wall of 40 that is at least **32 duplicates and a rate of at least 80%** — the criterion
would require below 25%, which is only reachable up to `N = 10`. For any wall larger than 10 it can
never pass. (The M2 plan's 77.5% was computed with nine looks; the pack exposes eight, so 80% is the
correct floor. The plan document is historical and is left alone.)

Two reachable criteria replaced it. Both are what the wall and the strip actually measure:

1. **Balance.** Every assignable look appears at least once, and no look is worn more than
   `ceil(N / looks)` times. For 40 identities and 8 looks that allows at most 5 per look. This is what
   “least-used assignment” really promises, and it is checkable for any `N`.
2. **Distinctness.** A strip of exactly one identity per look — 8 identities for this pack — must show
   8 distinct looks: a duplicate rate of 0. This is the human question “do these read as different
   avatars?”, asked on a set where the honest answer can actually be zero.

Measured on the default wall and strip today:

| Check | Definition | Result |
| --- | --- | --- |
| Wall balance, `N = 40` | every assignable look present; busiest look ≤ `ceil(40 / 8) = 5` | `ok: true`, `max 5`, `allowed 5`, `missing []`; every one of the 8 looks appeared exactly 5 times |
| Strip distinctness | one identity per assignable look | `8 / 8` distinct, `0%` repeat |

The gallery dev server (on port 5199 for this check) rendered those same numbers as
“Balanced · max 5 vs allowed 5 · 40 identities across 8 looks” and
“8 / 8 distinct looks · 0% repeat”. One wall cell carries the caption `#8 · look #2`: family 8 is a
body that can wear look 2, which is why the look count stays 8 while ten families exist.

## PNG identity

The PNG is not a second rendering path. The service builds one spec, calls `render` once, and hands
the resulting SVG string to the rasteriser; the `.svg` route calls the same `render` with the same
arguments. A spy test asserts that a `.png` request renders the SVG exactly once.

1. **One SVG string.** `apps/service/src/app.ts` calls `build(pack, identity)` and then
   `render(spec, { size, state })`. The `png` branch passes that exact string to
   `renderPng(svg, size)`. There is no second spec and no second SVG.
2. **Two encodings.** `renderPng` uses `@resvg/resvg-js` with `fitTo: { mode: "width", value: size }`,
   `background: "transparent"` and `font: { loadSystemFonts: false }`. The avatar SVG has no text; the
   font option was verified byte-neutral in the Task 6 record.
3. **The `:png` kind is in the tag.** `TagInput.kind` is `"svg" | "json" | "png"` and is part of the
   SHA-256 input `packHash|identityHash|size|state|kind`. A PNG and an SVG of the same avatar share
   every other input, so without the kind marker one representation could validate the other.
4. **Same tag inputs mean same bytes.** Because the PNG is rasterised from the string the SVG route
   serves, there is nothing else that could vary: the tag already covers pack content, identity,
   size and state.

Measured today against the built service on port 8792:

| Check | Result |
| --- | --- |
| `GET /v1/avatar/alice.png?size=256` | `200`, `image/png` |
| Dimensions | **256 × 256** (`sips`, and the PNG’s own IHDR) |
| Bytes | **17,363** |
| Alpha | colour type 6, `hasAlpha: yes`; corner pixel alpha 0 |
| ETag, PNG idle | `"ad36d63164b1a80b"` |
| ETag, SVG idle | `"efe82d0d1a4bc205"` |
| ETag, PNG working | `"5d05e2e08c9ea798"` |
| SVG tag replayed to `.png` | `200` (the kind differs, so it does not validate) |
| SVG tag replayed to `.svg` | `304` (the matching representation does validate) |
| Idle vs working PNG | byte-identical, SHA-256 `3c1ca4efdbb0866770221f6f6f15d66dc26c761587e66b4ca77597cf89c47db2`, both 17,363 bytes |

**PNG under `state=working` is a still frame.** `@resvg/resvg-js` rasterises the SVG document; it does
not run CSS animations, so the working-state PNG is the 0% (rest) keyframe. The bytes are identical
to the idle PNG above, while the ETag differs because `state` is a tag input. A mid-animation still
would need an explicit frame parameter, not a different rasteriser.

The pixel comparison against a browser render is a hand check, not a CI assertion — the PNG test
suite can read the IHDR without a decoder but cannot compare pixels. Method: composite the
transparent PNG over white, screenshot the same service SVG with headless Chrome at 256 × 256 over
white, and diff the RGB channels pixel by pixel.

| Check | Today (Chrome 156) | Task 6 record |
| --- | --- | --- |
| Byte-identical pixels | 50,578 / 65,536 = **77.2%** | 59,053 / 65,536 = 90.1% |
| Differ by more than 8/255 | 266 = **0.41%** | 322 = 0.49% |
| Differ by more than 32/255 | 1 | 22 |
| Largest channel difference | 33 | — |

Today's remaining exact-match gap is one-level gradient rounding: 14,218 pixels differ by exactly
1/255 and only a few hundred by 2–8. Of the 266 pixels above 8/255, 204 sit within 2 px of the
silhouette's partially transparent edge and the other 62 lie on the eyes' antialiased edges. The
shape, positions, colours and transparency agree; the differences are rasteriser edge sampling and
gradient rounding, not geometry. The earlier Task 6 run recorded a higher exact-match rate on the
same method; the thresholded result tells the same story, and the comparison remains a manual check
in both records.

The service's PNG tests cover the signature, IHDR dimensions, colour type 6 (alpha), the distinct
PNG tag, `304` for a matching PNG tag and the `16–1024` size contract. Pixel identity beyond that is
the one-rendering-path argument above plus the manual comparison recorded here.

## Clip library

Eight clips, defined by the pure function `clipFrame` in `packages/engine/src/clips.ts`. Six move the
body and two move only the eyes:

| Clip | Layer | Motion at amplitude 1 |
| --- | --- | --- |
| `breathe` | body | `scale` 1 → 1.04 and back |
| `bob` | body | `translateY` 0 → −5 px and back |
| `sway` | body | `rotate` 0 → 5° and back |
| `bounce` | body | lift to −6 px, stretching to 1.05 on the way up and squashing to 0.95 on landing |
| `tilt` | body | `rotate` ±3° with `translateY` 0 → −1.5 px |
| `shake` | body | `translateY` ±1.5 px, three cycles per loop |
| `blink` | eyes | `scaleY` 1 → 0.05 at the midpoint, open at both ends |
| `look-round` | eyes | `translateX` +5 → −5 units |

A pack picks one clip per family in `motion.clipByFamily`, one entry per shape. `organic-blob` uses:

| family | 0 | 1 | 2 | 3 | 4 | 5 | 6 (reserved) | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clip | breathe | bob | sway | look-round | breathe | bob | blink | tilt | bounce | shake |

The table length must equal `shapes.length`. `parsePack` rejects a wrong length and any name outside
`CLIP_NAMES`; the failure is at startup, and the message names the origin and the field. Reproduced
today with a one-family fixture whose clip was `"moonwalk"`:

```text
$ node apps/service/dist/cli.js --pack /tmp/m2-bad-clip.ts --port 8793
/tmp/m2-bad-clip.ts: motion.clipByFamily[0] must be one of breathe, bob, sway, bounce, tilt, shake, blink, look-round
$ echo $?
1
```

The renderer emits two stacked CSS animations from the same `clipFrame` function: `<id>-body` on the
body group and `<id>-eyes` on an inner group wrapped around the eye rects. `eyeRotation` stays a
static `transform` on the outer eye group. Both animated classes carry
`transform-box: fill-box; transform-origin: center`. Keyframes are sampled at 0, 25, 50, 75 and 100%
— `shake` and `look-round` are neutral at both 0 and 50%, and `tilt`'s rotation is too, so sampling
only those points would drop three clips' visible motion — and both endpoints are rest, so the loop
has no seam.

**The renderer now consumes `motionAmplitude`.** Until M2 the working animation was a hardcoded
`scale(1.04)`; it now scales every channel of `clipFrame(spec.clip, progress, spec.motionAmplitude)`.
Measured today on identity `amp-0` (family 1, clip `bob`) at keyframe 50%:

- amplitude 1 → `translate(0px, -5px)`
- amplitude 0.5 → `translate(0px, -2.5px)`

## Deliberately not done

- **A pack hash in the URL.** Links carry `pack=<id>`, and a content hash would only pin exact bytes
  once packs come from outside the build; it waits for M3 and third-party packs.
- **A build hash in the tag.** It would invalidate every cached avatar on every new build and needs a
  release-version pipeline that does not exist yet; a renderer-affecting change must change pack
  content until then.
- **A `verify` CLI.** `parsePack`, the startup conformance sweep and the gallery's metric tests
  already reject bad packs and count looks, and there is no external pack author to hand it to before
  packs ship.

## Verification

Run on 2026-10-27 while writing this file:

```text
pnpm typecheck                          pass
pnpm test                               24 files / 236 tests passed
pnpm build                              pass
pnpm --filter @botavatar/gallery build  pass (163.70 kB JS / 53.68 kB gzip, 5.31 kB CSS / 1.65 kB gzip)
```

`pnpm test` runs `pnpm build` first, so the cross-process and CLI tests exercise the built packages.
