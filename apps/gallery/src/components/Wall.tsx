import type { StylePack } from "@botavatar/engine";
import { avatarAssignableLooks, buildGeometry } from "@botavatar/engine";
import { renderGeometry } from "@botavatar/svg";
import { useMemo } from "react";
import { balance, distinctness, wallIdentities } from "../metrics.js";

export interface WallProps {
  pack: StylePack;
  ids: readonly string[];
  size: number;
  selected: string | null;
  onSelect: (identity: string) => void;
}

/** The strip stays readable at small wall sizes and never dwarfs the wall at large ones. */
function stripSizeFor(size: number): number {
  return Math.max(64, Math.min(size, 128));
}

/**
 * Every cell goes through `buildGeometry` + `renderGeometry`. For a `rect` pack that
 * is byte-identical to `renderSvg`, and for a sphere pack (the orb) it is the only
 * path that can draw the eyes at all — one path, both rigs.
 */
export function Wall({ pack, ids, size, selected, onSelect }: WallProps) {
  const geometries = useMemo(
    () => ids.map((identity) => buildGeometry(pack, identity)),
    [ids, pack],
  );
  const looks = useMemo(() => avatarAssignableLooks(pack.shapes), [pack]);
  const result = useMemo(() => balance(geometries, looks), [geometries, looks]);
  const cells = useMemo(
    () => geometries.map((geometry) => ({ geometry, svg: renderGeometry(geometry, { size }) })),
    [geometries, size],
  );

  const strip = useMemo(
    () => wallIdentities(pack, looks.length).map((identity) => buildGeometry(pack, identity)),
    [pack, looks],
  );
  const stripSize = stripSizeFor(size);
  const stripCells = useMemo(
    () =>
      strip.map((geometry) => ({ geometry, svg: renderGeometry(geometry, { size: stripSize }) })),
    [strip, stripSize],
  );
  const spread = useMemo(() => distinctness(strip), [strip]);
  const balanceLabel =
    `${result.ok ? "Balanced" : "Unbalanced"}: busiest look max ${result.max}, ` +
    `allowed ${result.allowed}, across ${geometries.length} identities and ${looks.length} assignable looks.` +
    (result.missing.length > 0
      ? ` Missing looks: ${result.missing.map((look) => `#${look}`).join(", ")}.`
      : "") +
    (result.reserved > 0
      ? ` A reserved look is present in ${result.reserved} identities and is not part of the assignment pool.`
      : "");

  return (
    <>
      <div className={`balance ${result.ok ? "ok" : "bad"}`} role="status" aria-label={balanceLabel}>
        <strong>{result.ok ? "Balanced" : "Unbalanced"}</strong>
        <span translate="no" className="notranslate">
          max {result.max} vs allowed {result.allowed}
        </span>
        <span className="balance-detail notranslate" translate="no">
          {geometries.length} identities across {looks.length} assignable looks
        </span>
        {result.missing.length > 0 && (
          <span className="balance-detail notranslate" translate="no">
            missing looks {result.missing.map((look) => `#${look}`).join(", ")}
          </span>
        )}
        {result.reserved > 0 && (
          <span className="balance-detail notranslate" translate="no">
            reserved look present · {result.reserved}{" "}
            {result.reserved === 1 ? "identity is" : "identities are"} outside the assignment pool
          </span>
        )}
      </div>

      <div
        className="wall"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${size}px, 100%), 1fr))` }}
      >
        {cells.map(({ geometry, svg }) => (
          <button
            key={geometry.identity}
            type="button"
            className="cell"
            aria-pressed={selected === geometry.identity}
            aria-label={`${geometry.identity}: family ${geometry.family}, look ${geometry.look}, ${geometry.ink.bodyName}`}
            title={`${geometry.identity}\n#${geometry.family} · look #${geometry.look} · ${geometry.ink.bodyName}`}
            onClick={() => onSelect(geometry.identity)}
          >
            <span className="cell-art" dangerouslySetInnerHTML={{ __html: svg }} />
            <span className="cell-caption notranslate" translate="no">
              #{geometry.family} · look #{geometry.look} · {geometry.ink.bodyName}
            </span>
          </button>
        ))}
      </div>

      <section className="strip" aria-label="One identity per look">
        <div className="strip-head">
          <h2>One per look</h2>
          <p className="metric">
            <strong translate="no" className="notranslate">
              {spread.distinct} / {spread.total}
            </strong>{" "}
            distinct looks ·{" "}
            <span translate="no" className="notranslate">
              {Math.round(spread.rate * 100)}%
            </span>{" "}
            repeat
          </p>
        </div>
        <div className="strip-row">
          {stripCells.map(({ geometry, svg }) => (
            <button
              key={geometry.identity}
              type="button"
              className="strip-cell"
              aria-pressed={selected === geometry.identity}
              aria-label={`${geometry.identity}: family ${geometry.family}, look ${geometry.look}, ${geometry.ink.bodyName}`}
              title={`${geometry.identity}\n#${geometry.family} · look #${geometry.look} · ${geometry.ink.bodyName}`}
              onClick={() => onSelect(geometry.identity)}
            >
              <span className="cell-art" dangerouslySetInnerHTML={{ __html: svg }} />
              <span className="cell-caption notranslate" translate="no">
                look #{geometry.look} · {geometry.ink.bodyName}
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
