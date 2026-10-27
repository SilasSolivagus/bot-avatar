import { buildAvatarSpec } from "@botavatar/engine";
import { renderSvg } from "@botavatar/svg";
import { useEffect, useState } from "react";
import { IdentityInput } from "./components/IdentityInput.js";
import { PackPicker } from "./components/PackPicker.js";
import { wallIdentities } from "./metrics.js";
import { galleryPacks } from "./packs.js";
import { formatWallState, MAX_IDS, parseWallState, type WallState } from "./state.js";

/** The wall is a 40-identity comparison; the default ids come from the pack, balanced. */
const WALL_COUNT = 40;

const PACKS = galleryPacks();
const PACK_IDS = PACKS.map((entry) => entry.pack.id);

interface View {
  state: WallState;
  packIndex: number;
}

/**
 * Parse the URL twice: once to learn which pack is selected, then again with the
 * default ids for that pack. A missing `ids` therefore means "this pack's balanced
 * wall", not the previous pack's identities.
 */
function readView(search: string): View {
  const probe = parseWallState(search, PACK_IDS, []);
  const packIndex = Math.max(0, PACKS.findIndex((entry) => entry.pack.id === probe.pack));
  const pack = PACKS[packIndex]!.pack;
  const state = parseWallState(search, PACK_IDS, wallIdentities(pack, WALL_COUNT));
  return { state, packIndex };
}

export function App() {
  const [view, setView] = useState<View>(() => readView(window.location.search));
  const { state, packIndex } = view;
  const entry = PACKS[packIndex]!;
  const pack = entry.pack;

  useEffect(() => {
    const sync = () => setView(readView(window.location.search));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  /** Every URL write goes through `formatWallState`, so ids are encoded once, in one place. */
  const update = (next: WallState) => {
    const search = formatWallState(next);
    history.replaceState(null, "", search);
    setView(readView(search));
  };

  const changePack = (packId: string) => {
    const next = PACKS.find((candidate) => candidate.pack.id === packId);
    if (!next) return;
    update({ pack: next.pack.id, ids: wallIdentities(next.pack, WALL_COUNT), size: state.size });
  };

  const addIdentity = (identity: string) => {
    if (state.ids.includes(identity)) return;
    update({ ...state, ids: [...state.ids, identity].slice(0, MAX_IDS) });
  };

  const spec = state.ids[0] ? buildAvatarSpec(pack, state.ids[0]) : null;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Bot Avatar Gallery</h1>
          <p className="muted">
            {entry.label} · {state.ids.length} of {MAX_IDS} identities · {state.size}px
          </p>
        </div>
        <PackPicker packs={PACKS} value={state.pack} onChange={changePack} />
        <IdentityInput pack={pack} onAdd={addIdentity} />
      </header>

      <section className="preview">
        <div className="preview-card">
          {spec ? (
            <div dangerouslySetInnerHTML={{ __html: renderSvg(spec, { size: state.size }) }} />
          ) : (
            <p className="muted">No identity selected.</p>
          )}
        </div>
        <div className="preview-text">
          <p className="muted">
            First identity: <code>{state.ids[0] ?? "—"}</code>
          </p>
          <p className="id-list">{state.ids.join(", ")}</p>
        </div>
      </section>
    </main>
  );
}
