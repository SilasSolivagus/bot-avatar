# bot-avatar

Deterministic avatars from any identity string. One algorithm, swappable styles.

```ts
import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "@botavatar/svg";

const svg = renderSvg(buildAvatarSpec(organicBlob, "alice@example.com"), { size: 96 });
```

Nothing is stored: the avatar is derived from the identity, so every device
draws the same one. No dependencies, no DOM, ESM only.

## Packages

- `@botavatar/engine` — hashing, family/look selection, colour, outline → path, spec builder.
- `@botavatar/pack-organic-blob` — the first style pack: ten bodies, eleven colours.
- `@botavatar/svg` — spec → SVG string.

## Assignment

There is no engine-level assigner: `avatarAssignableLooks` is the primitive, and
hosts enforce the pool. The identity hash may still land on a reserved family —
that is deliberate, so existing identities keep their avatar. Anything handing
out new identities must draw from `avatarAssignableLooks`, which drops reserved
families and merges equivalent looks.

## Status

Milestone M0: library only. No HTTP service, no gallery, no PNG, no legacy
value compatibility yet — see `docs/specs/2026-10-27-bot-avatar-spec.md`.

## Licence

Apache-2.0. The geometry and palette are derived from Rakazo commit `a0e5781`;
see `NOTICE`.
