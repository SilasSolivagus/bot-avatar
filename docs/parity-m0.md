# M0 parity evidence

One-time comparison of `@botavatar/engine` against Rakazo commit `a0e5781`.

## Method

`parity/record.mjs` imported `packages/core/src/avatar-shape.ts` from a local
checkout and recorded `seed`, `family`, `look` and `path` for 110 identities
(100 synthetic `fixture-N`, plus one upstream sample identity per family).
`parity/fixtures/upstream.json` is the committed result.

The engine's parity test compares `buildAvatarSpec(pack, identity).path` to the
recorded `path` string. Colour is compared against 12 hand-recorded
`(identity, colorId)` pairs in `packages/engine/test/spec.test.ts`, taken from
the same commit.

## Scope and limits

- "Identical" means spec-level: `seed`, `family`, `look`, `path`, `eyeRotation`,
  `durationMs`, `color.id`. It is not SVG string equality — upstream derives
  gradient ids from React `useId`, so its markup is not comparable literally.
- This comparison is a historical record, not a CI gate. It runs only via
  `pnpm parity`. If the engine's geometry changes on purpose after M0, record
  the change here and leave the fixture alone; do not update the fixture to
  match new output, or the evidence stops meaning anything.

## Status

Run on 2026-10-27 against fixture `parity/fixtures/upstream.json`
(commit `a0e5781`): 110/110 identities matched on `seed`, `family`, `look`
and `path`; 12/12 colour pairs matched on `color.id`; `eyeRotation` and
`durationMs` matched the recorded values.

This was a one-time check. The fixture is frozen; the harness stays opt-in
(`pnpm parity`) and is not part of `pnpm test`.
