import { buildAvatarSpec } from "@botavatar/engine";
import { organicBlob } from "@botavatar/pack-organic-blob";
import { renderSvg } from "@botavatar/svg";

const spec = buildAvatarSpec(organicBlob, "alice");

export function App() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 18 }}>Bot Avatar Gallery</h1>
      <div dangerouslySetInnerHTML={{ __html: renderSvg(spec, { size: 160 }) }} />
    </main>
  );
}
