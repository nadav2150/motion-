// Tiny CSS confetti burst for successful purchases. No dependency; the pieces
// remove themselves. Skipped for users who prefer reduced motion.

const COLORS = ["#ef8354", "#f39a73", "#fca37d", "#a78bfa", "#6fcf97", "#ffffff"];

export function celebrate(count = 70): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:130;overflow:hidden";
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    const size = 6 + Math.random() * 6;
    const x = 50 + (Math.random() - 0.5) * 30;
    const dx = (Math.random() - 0.5) * 120;
    const dy = 60 + Math.random() * 50;
    const rot = Math.random() * 720 - 360;
    piece.style.cssText =
      `position:absolute;left:${x}vw;top:35vh;width:${size}px;height:${size * 0.45}px;` +
      `background:${COLORS[i % COLORS.length]};border-radius:2px;opacity:1`;
    layer.appendChild(piece);
    piece.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}vw, ${dy}vh) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 900, easing: "cubic-bezier(.2,.6,.3,1)", fill: "forwards" },
    );
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}
