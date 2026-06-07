// app/lib/hyperframes/engines/registry.ts
// Engine adapter registry + CDN collection. Only GSAP is registered in this
// phase; three/anime/waapi adapters land in the follow-on plan and register
// here. getEngineAdapter returns null for unregistered engines so callers can
// degrade gracefully (drop the layer) rather than throw.

import { gsapAdapter } from "./gsap";
import { animeAdapter } from "./anime";
import { waapiAdapter } from "./waapi";
import type { EngineAdapter, Layer, LayerEngine } from "./types";

const ADAPTERS: Partial<Record<LayerEngine, EngineAdapter>> = {
  gsap: gsapAdapter,
  anime: animeAdapter,
  waapi: waapiAdapter,
};

export function getEngineAdapter(engine: LayerEngine): EngineAdapter | null {
  return ADAPTERS[engine] ?? null;
}

/**
 * Extra CDN <script> srcs to inject for the engines used across all layers,
 * deduped, excluding GSAP (the skeleton always loads it) and any engine whose
 * adapter declares no CDN or isn't registered yet.
 */
export function collectExtraCdn(layers: Layer[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const layer of layers) {
    const adapter = getEngineAdapter(layer.engine);
    if (!adapter?.cdn) continue;
    if (seen.has(adapter.cdn)) continue;
    seen.add(adapter.cdn);
    out.push(adapter.cdn);
  }
  return out;
}
