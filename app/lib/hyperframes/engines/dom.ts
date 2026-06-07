// app/lib/hyperframes/engines/dom.ts
// Shared layer-DOM stacking. A single layer renders unwrapped (byte-identical
// to the pre-layer skeleton); stacked layers get an absolutely-positioned
// wrapper so z-order is explicit. Used by every engine adapter's emitDom.

export function stackLayerDom(html: string, index: number, total: number): string {
  if (total <= 1) return html;
  return `<div class="layer" style="position:absolute;inset:0;z-index:${index}">${html}</div>`;
}
