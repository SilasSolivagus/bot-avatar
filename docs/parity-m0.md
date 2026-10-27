# M0 parity evidence

One-time comparison of `@botavatar/engine` against Rakazo commit `a0e5781`.

## Method

`parity/record.mjs` imported `packages/core/src/avatar-shape.ts` from a local
checkout and recorded `seed`, `family`, `look` and `path` for 110 identities
(100 synthetic `fixture-N`, plus one upstream sample identity per family).
`parity/fixtures/upstream.json` is the committed result.

`parity/fixture-parity.test.ts` is the only test that reads the fixture. It
compares, for all 110 rows:

- `seed` from `avatarSeed`;
- `family` from `avatarFamily`;
- `look` from `avatarLook`;
- `seed`, `family`, `look` and `path` from `buildAvatarSpec`;
- `path` from `outlinePath` directly against the pack's shape data.

It also compares 12 hand-recorded `(identity, colorId)` pairs, taken from the
same commit, against `colorIndex`. The recorded evidence that a hash can land
on the reserved family lives there too.

## Scope and limits

- "Identical" means spec-level: `seed`, `family`, `look`, `path`,
  `eyeRotation`, `durationMs`, `color.id`. It is not SVG string equality —
  upstream derives gradient ids from React `useId`, so its markup is not
  comparable literally. `eyeRotation` and `durationMs` are arithmetic over the
  seed; the hand-recorded values are asserted in the default suite, which does
  not read the fixture.
- This comparison is a historical record, not a CI gate. It runs only via
  `pnpm parity` (one file, seven tests). The root `vitest.config.ts` excludes
  `parity/**`, and no test under `packages/**/test` reads the fixture. If the
  engine's geometry changes on purpose after M0, record the change here and
  leave the fixture alone; do not update the fixture to match new output, or
  the evidence stops meaning anything.

## Status

Run on 2026-10-27 against fixture `parity/fixtures/upstream.json`
(commit `a0e5781`): 110/110 identities matched on `seed`, `family`, `look`
and `path`; 12/12 colour pairs matched on `color.id`; the hand-recorded
`eyeRotation` and `durationMs` values also matched.

Measured counts after moving the fixture comparison out of the default suite:

- `pnpm test` — 11 files, 57 tests. Covers determinism, field shapes, look
  merging, reserved-pool assignment, distribution, rendering, cross-process
  output, packaging and brand checks. It does not read the fixture.
- `pnpm parity` — 1 file, 7 tests, all fixture comparisons.

This was a one-time check. The fixture is frozen; the harness stays opt-in
(`pnpm parity`) and is not part of `pnpm test`.
