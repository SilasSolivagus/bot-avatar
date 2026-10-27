import { avatarAssignableLooks, buildAvatarSpec } from "@botavatar/engine";
import { useEffect, useMemo, useState } from "react";
import { DetailCard } from "./components/DetailCard.js";
import { IdentityInput } from "./components/IdentityInput.js";
import { PackPicker } from "./components/PackPicker.js";
import { Wall } from "./components/Wall.js";
import { wallIdentities } from "./metrics.js";
import { galleryPacks } from "./packs.js";
import {
  addWallIdentity,
  formatWallState,
  MAX_IDS,
  parseWallState,
  type WallState,
} from "./state.js";

/** The wall is a 40-identity comparison; the default ids come from the pack, balanced. */
const WALL_COUNT = 40;

const PACKS = galleryPacks();
const PACK_IDS = PACKS.map((entry) => entry.pack.id);

interface View {
  state: WallState;
  packIndex: number;
  service: string;
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
  const service = new URLSearchParams(search).get("service") ?? "";
  return { state, packIndex, service };
}

/** `formatWallState` owns the wall parameters; the service hint is the one extra to keep alive. */
function urlFor(state: WallState, service: string): string {
  const base = formatWallState(state);
  return service === "" ? base : `${base}&service=${encodeURIComponent(service)}`;
}

export function App() {
  const [view, setView] = useState<View>(() => readView(window.location.search));
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { state, packIndex, service } = view;
  const entry = PACKS[packIndex]!;
  const pack = entry.pack;
  const looks = useMemo(() => avatarAssignableLooks(pack.shapes), [pack]);

  useEffect(() => {
    const sync = () => {
      setView(readView(window.location.search));
      setSelected(null);
      setNotice(null);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  /** Every URL write goes through `formatWallState`, so ids are encoded once, in one place. */
  const update = (next: WallState) => {
    const search = urlFor(next, service);
    history.replaceState(null, "", search);
    setView(readView(search));
  };

  const changePack = (packId: string) => {
    const next = PACKS.find((candidate) => candidate.pack.id === packId);
    if (!next) return;
    update({
      pack: next.pack.id,
      ids: wallIdentities(next.pack, WALL_COUNT),
      size: state.size,
    });
    setSelected(null);
    setNotice(null);
  };

  const addIdentity = (identity: string) => {
    const next = addWallIdentity(state.ids, identity);
    if (next.outcome === "full") {
      // At the cap the wall and the URL stay as they are, so selecting the
      // rejected identity would point the detail card at something not on the wall.
      setNotice(`wall is full (${MAX_IDS})`);
      return;
    }
    if (next.outcome === "added") update({ ...state, ids: next.ids });
    setSelected(identity);
    setNotice(null);
  };

  const detailSize = Math.min(320, Math.max(200, Math.round(state.size * 1.5)));
  const selectedSpec = selected === null ? null : buildAvatarSpec(pack, selected);

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Bot Avatar Gallery</h1>
          <p className="muted">
            {entry.label} · {state.ids.length} of {MAX_IDS} identities · {looks.length} assignable
            looks · {state.size}px
          </p>
        </div>
        <PackPicker packs={PACKS} value={state.pack} onChange={changePack} />
        <IdentityInput pack={pack} onAdd={addIdentity} notice={notice} />
      </header>

      <div className="layout">
        <section className="panel wall-panel" aria-label="Comparison wall">
          <div className="section-head">
            <h2>Comparison wall</h2>
            <p className="muted">Click a cell to inspect it.</p>
          </div>
          <Wall
            pack={pack}
            ids={state.ids}
            size={state.size}
            selected={selected}
            onSelect={setSelected}
          />
        </section>

        <aside className="detail-panel">
          <DetailCard spec={selectedSpec} size={detailSize} service={service} />
        </aside>
      </div>
    </main>
  );
}
