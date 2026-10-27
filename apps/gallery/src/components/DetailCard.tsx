import type { AvatarSpec } from "@botavatar/engine";
import { renderSvg } from "@botavatar/svg";
import { useEffect, useRef, useState } from "react";

type Motion = "idle" | "working";
type CopyState = "idle" | "copied" | "fallback";

export interface DetailCardProps {
  spec: AvatarSpec | null;
  size: number;
  service: string;
}

/** The base of a configured service URL, or null when the value is not an http(s) base. */
export function serviceBase(raw: string): string | null {
  if (raw.trim() === "") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * The gallery never rasterises: the PNG link points at the service, which owns
 * the native dependency. No service URL means no link, not a broken one.
 */
function pngHref(service: string, spec: AvatarSpec, size: number, state: Motion): string | null {
  const base = serviceBase(service);
  if (base === null) return null;
  const query = new URLSearchParams({ pack: spec.packId, size: String(size), state });
  return `${base}/v1/avatar/${encodeURIComponent(spec.identity)}.png?${query.toString()}`;
}

export function DetailCard({ spec, size, service }: DetailCardProps) {
  const [motion, setMotion] = useState<Motion>("idle");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const fallback = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const identity = spec?.identity ?? "";

  useEffect(() => {
    setMotion("idle");
    setCopyState("idle");
  }, [identity]);

  useEffect(
    () => () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (copyState !== "fallback") return;
    fallback.current?.focus();
    fallback.current?.select();
  }, [copyState]);

  if (!spec) {
    return (
      <section className="detail panel" aria-label="Identity detail">
        <h2>Detail</h2>
        <p className="muted">Click a cell on the wall to inspect its identity, spec and SVG.</p>
      </section>
    );
  }

  const svg = renderSvg(spec, { size, state: motion });
  const png = pngHref(service, spec, size, motion);

  const copySvg = async () => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(svg);
      setCopyState("copied");
      if (timer.current !== undefined) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("fallback");
    }
  };

  const downloadSvg = () => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${spec.identity}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section className="detail panel" aria-label="Identity detail">
      <div className="detail-head">
        <h2>Detail</h2>
        <span className="detail-id">{spec.identity}</span>
      </div>
      <p className="muted detail-caption">
        #{spec.family} · look #{spec.look} · {spec.color.name}
      </p>
      <div className="detail-art" dangerouslySetInnerHTML={{ __html: svg }} />

      <div className="detail-actions">
        <button type="button" className="action" onClick={copySvg}>
          {copyState === "copied" ? "Copied" : "Copy SVG"}
        </button>
        <button type="button" className="action" onClick={downloadSvg}>
          Download SVG
        </button>
        {png ? (
          <a
            className="action"
            href={png}
            download={`${spec.identity}.png`}
            target="_blank"
            rel="noreferrer"
            title={png}
          >
            Download PNG
          </a>
        ) : (
          <button
            type="button"
            className="action"
            disabled
            title="Download PNG requires an http(s) service URL — add ?service=http://host:port to this page."
          >
            Download PNG
          </button>
        )}
      </div>
      {!png && (
        <p className="hint">
          PNG is rasterised by the service. Add <code>?service=http://host:port</code> to enable it.
        </p>
      )}

      <div className="motion-row">
        <span className="field-label">Motion</span>
        <div className="motion-toggle" role="group" aria-label="Motion state">
          {(["idle", "working"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className="chip"
              aria-pressed={motion === option}
              onClick={() => setMotion(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <span className="muted">{motion === "working" ? `animating ${spec.durationMs}ms` : "static"}</span>
      </div>

      {copyState === "fallback" && (
        <div className="copy-fallback">
          <p className="hint">
            Clipboard access was refused (insecure context). The SVG is selected below — press ⌘C
            / Ctrl+C to copy.
          </p>
          <textarea
            ref={fallback}
            readOnly
            rows={4}
            value={svg}
            aria-label="SVG source"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}

      <pre className="spec-json">{JSON.stringify(spec, null, 2)}</pre>
    </section>
  );
}
