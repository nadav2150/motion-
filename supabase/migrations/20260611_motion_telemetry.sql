-- Motion telemetry: deterministic per-scene motion measurements (MotionMetrics
-- JSON) computed from rendered element rects/opacities sampled at ~4 Hz.
-- Captured alongside the motion-trail composite in jobs.ts:captureScenes;
-- consumed by the vision critique (telemetry text block) and refinement
-- gating (telemetryGates). Null when sampling failed or hasn't run.
--
-- See app/lib/hyperframes/motion-telemetry.ts and
-- docs/superpowers/specs/2026-06-11-motion-telemetry-design.md.

alter table shots
  add column if not exists motion_telemetry jsonb;
