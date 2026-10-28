import type { AvatarGeometry, Pose } from "@botavatar/engine";
import { renderGeometry } from "@botavatar/svg";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { gazeFromPointer, poseGeometry, REST_POSE } from "../pose.js";

type Motion = "idle" | "working";
type CopyState = "idle" | "copied" | "fallback";

export interface DetailCardProps {
  geometry: AvatarGeometry | null;
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
function pngHref(
  service: string,
  geometry: AvatarGeometry,
  size: number,
  state: Motion,
): string | null {
  const base = serviceBase(service);
  if (base === null) return null;
  const query = new URLSearchParams({ pack: geometry.packId, size: String(size), state });
  return `${base}/v1/avatar/${encodeURIComponent(geometry.identity)}.png?${query.toString()}`;
}

interface GazeSliderProps {
  name: "yaw" | "pitch";
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

/**
 * One gaze axis. The name and the number are technical, so the whole control is
 * marked `translate="no"`: a page translator must not turn "-40°" into words.
 */
function GazeSlider({ name, min, max, value, onChange }: GazeSliderProps) {
  return (
    <label className="gaze-control notranslate" translate="no">
      <span className="gaze-name">{name}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label={`gaze ${name}, degrees`}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="gaze-value">{value}°</span>
    </label>
  );
}

export function DetailCard({ geometry, size, service }: DetailCardProps) {
  const [motion, setMotion] = useState<Motion>("idle");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [gaze, setGaze] = useState<Pose["gaze"]>(REST_POSE.gaze);
  const [lidOpen, setLidOpen] = useState(REST_POSE.lidOpen);
  /**
   * The pointer's gaze while it is over the card, or `null` when the sliders own the
   * gaze. The card is the follow area; the controls are excluded in `followPointer`
   * so a slider drag is never pulled back by a second pose.
   */
  const [follow, setFollow] = useState<Pose["gaze"] | null>(null);
  const fallback = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const identity = geometry?.identity ?? "";

  useEffect(() => {
    setMotion("idle");
    setCopyState("idle");
    setGaze({ ...REST_POSE.gaze });
    setLidOpen(REST_POSE.lidOpen);
    setFollow(null);
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

  if (!geometry) {
    return (
      <section className="detail panel" aria-label="Identity detail">
        <h2>Detail</h2>
        <p className="muted">Click a cell on the wall to inspect its identity, geometry and SVG.</p>
      </section>
    );
  }

  // The sliders are a pose on top of the identity's geometry, never a second avatar:
  // the wall keeps rendering the same object, unchanged. A pointer over the card
  // replaces the sliders' gaze while it is there; leaving restores the sliders.
  const posed = poseGeometry(geometry, { gaze: follow ?? gaze, lidOpen });
  const svg = renderGeometry(posed, { size, state: motion });
  const png = pngHref(service, geometry, size, motion);
  const sphere = geometry.rig.kind === "sphere";
  const following = follow !== null;

  /**
   * Pointer-follow. The card is the follow area, but a pointer on a control belongs
   * to that control: following is suspended there, so dragging a slider is never
   * overridden on the next move and the manual mode keeps working. Moving back onto
   * the card outside its controls hands the gaze to the pointer again.
   */
  const followPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest("input, button, a, textarea, select")) {
      setFollow(null);
      return;
    }
    const next = gazeFromPointer(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
    );
    // Skip the re-render when the pointer stays within the same degree.
    setFollow((current) =>
      current !== null && current.yaw === next.yaw && current.pitch === next.pitch ? current : next,
    );
  };

  const stopFollowing = () => setFollow(null);

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
    anchor.download = `${geometry.identity}.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <section
      className="detail panel"
      aria-label="Identity detail"
      onPointerMove={sphere ? followPointer : undefined}
      onPointerLeave={sphere ? stopFollowing : undefined}
      onPointerCancel={sphere ? stopFollowing : undefined}
    >
      <div className="detail-head">
        <h2>Detail</h2>
        <span className="detail-id notranslate" translate="no">
          {geometry.identity}
        </span>
      </div>
      <p className="muted detail-caption notranslate" translate="no">
        #{geometry.family} · look #{geometry.look} · {geometry.ink.bodyName}
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
            download={`${geometry.identity}.png`}
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
          PNG is rasterised by the service. Add{" "}
          <code translate="no" className="notranslate">
            ?service=http://host:port
          </code>{" "}
          to enable it.
        </p>
      )}

      {/* A `rect` rig ignores the pose, so these controls would be dead levers there. */}
      {sphere && (
        <div className="gaze-row" role="group" aria-label="Gaze">
          <span className="field-label">Gaze</span>
          <GazeSlider
            name="yaw"
            min={-45}
            max={45}
            value={gaze.yaw}
            onChange={(yaw) => {
              // A control the user is moving beats a pointer that merely rests on the
              // card: the slider becomes the mode again, even without pointer movement.
              setFollow(null);
              setGaze({ ...gaze, yaw });
            }}
          />
          <GazeSlider
            name="pitch"
            min={-30}
            max={30}
            value={gaze.pitch}
            onChange={(pitch) => {
              setFollow(null);
              setGaze({ ...gaze, pitch });
            }}
          />
          <span className="muted gaze-follow" aria-live="polite">
            <span className="gaze-status">{following ? "pointer" : "sliders"}</span> steering · move
            the pointer over the card to steer
          </span>
          <button
            type="button"
            className="chip notranslate"
            translate="no"
            aria-pressed={lidOpen !== 1}
            title="render with lidOpen 0.1"
            onClick={() => setLidOpen(lidOpen === 1 ? 0.1 : 1)}
          >
            blink
          </button>
        </div>
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
        <span className="muted">
          {motion === "working" ? (
            <>
              animating{" "}
              <span translate="no" className="notranslate">
                {geometry.durationMs}ms
              </span>
            </>
          ) : (
            "static"
          )}
        </span>
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

      <pre className="spec-json notranslate" translate="no">
        {JSON.stringify(posed, null, 2)}
      </pre>
    </section>
  );
}
