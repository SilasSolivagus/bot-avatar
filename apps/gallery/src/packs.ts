import type { StylePack } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";

/** One entry in the pack switcher: the pack itself plus the label shown to a human. */
export interface GalleryPack {
  pack: StylePack;
  label: string;
}

/**
 * Every module under `src/packs/` is a pack, discovered by Vite's glob. The glob is
 * the only import path: naming a pack here as well would render it twice.
 */
const local = import.meta.glob<{ default: StylePack }>("./packs/*.ts", { eager: true });

export function galleryPacks(): GalleryPack[] {
  const builtin: GalleryPack[] = [{ pack: organicBlob, label: organicBlob.name }];
  const extra: GalleryPack[] = Object.entries(local)
    .map(([path, module]) => ({
      pack: module.default,
      label: `${module.default.name} (${path.split("/").pop()?.replace(/\.ts$/, "") ?? ""})`,
    }))
    .filter((entry) => entry.pack.id !== organicBlob.id);

  const seen = new Set<string>();
  return [...builtin, ...extra].filter((entry) => {
    if (seen.has(entry.pack.id)) return false;
    seen.add(entry.pack.id);
    return true;
  });
}
