import { Resvg } from "@resvg/resvg-js";

/** Rasterises the exact SVG string the service already produced. One rendering path, two encodings. */
export function renderPng(svg: string, size: number): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "transparent",
    // The avatar SVG contains no text. Loading system fonts scans every font on
    // the machine (~600 ms per render here); the rendered bytes are identical.
    font: { loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
