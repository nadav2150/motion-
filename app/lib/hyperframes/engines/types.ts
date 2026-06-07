// app/lib/hyperframes/engines/types.ts
// Layer model for multi-engine scene composition. A scene is a back-to-front
// stack of layers; each layer is owned by one engine adapter.

export type LayerEngine = "gsap" | "three" | "anime" | "waapi";

export type Layer = {
  /** Unique within the scene. */
  id: string;
  engine: LayerEngine;
  /** DOM for this layer (a <canvas> for three). Optional for code-only layers. */
  html?: string;
  /** Layer-scoped CSS. */
  css?: string;
  /** Engine-specific JS. Scene-local time axis: 0 = scene start. */
  code: string;
};

/** Where/when a layer is being emitted, supplied by buildFilmSkeleton. */
export type LayerEmitContext = {
  /** "s1", "s2", … */
  sceneId: string;
  /** Master-timeline offset for the scene, in seconds. */
  start: number;
  /** Scene duration in seconds. */
  duration: number;
  /** Layer index within the scene (0 = backmost). */
  index: number;
  /** Total layer count in the scene. */
  total: number;
};

export type EngineAdapter = {
  engine: LayerEngine;
  /** CDN <script> src to inject when this engine is used; null = native (WAAPI). */
  cdn: string | null;
  /** HTML emitted into .scene-content for this layer. */
  emitDom(layer: Layer, ctx: LayerEmitContext): string;
  /**
   * Self-contained JS block for this layer, concatenated into the composition's
   * single inline <script> after all CDN libs have loaded. For GSAP this is the
   * IIFE that adds the layer's tweens to the master timeline at the scene offset.
   */
  emitJs(layer: Layer, ctx: LayerEmitContext): string;
};
