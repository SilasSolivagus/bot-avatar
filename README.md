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

## Status

Milestone M0, under construction: the workspace and toolchain are in place; the
package sources land in later tasks. No HTTP service, no gallery, no PNG yet —
see `docs/specs/2026-10-27-bot-avatar-spec.md`.

## Licence

Apache-2.0. The geometry and palette are derived from Rakazo commit `a0e5781`;
see `NOTICE`.
