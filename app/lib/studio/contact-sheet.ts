// Contact sheet: a grid of captured frames with small time labels, used for
// the vision review pass and for debugging renders.

import sharp from "sharp";

const TILE_MAX_WIDTH = 480;
const GAP = 8;
const BACKGROUND = { r: 17, g: 19, b: 26 };

function label(time: number): string {
  const m = Math.floor(time / 60);
  const s = time - m * 60;
  return m > 0 ? `${m}:${s.toFixed(2).padStart(5, "0")}` : `${s.toFixed(2)}s`;
}

function labelSvg(text: string, height: number): Buffer {
  const fontSize = Math.max(11, Math.round(height * 0.07));
  const padX = Math.round(fontSize * 0.5);
  const w = Math.round(text.length * fontSize * 0.62 + padX * 2);
  const h = Math.round(fontSize * 1.5);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect width="${w}" height="${h}" rx="${Math.round(h / 4)}" fill="#000" fill-opacity="0.72"/>` +
      `<text x="${padX}" y="${Math.round(h * 0.72)}" font-family="DejaVu Sans Mono, Consolas, monospace" font-size="${fontSize}" fill="#fff">${text}</text>` +
      `</svg>`,
  );
}

// frames: JPEG (or any sharp-readable) buffers with their times in seconds.
// Tiles keep the first frame's aspect ratio; returns a JPEG.
export async function makeContactSheet(frames: { time: number; jpeg: Buffer }[], cols = 4): Promise<Buffer> {
  if (frames.length === 0) throw new Error("makeContactSheet: no frames");
  cols = Math.max(1, Math.min(Math.floor(cols) || 4, frames.length));
  const rows = Math.ceil(frames.length / cols);
  const first = await sharp(frames[0].jpeg).metadata();
  const srcW = first.width ?? 1920;
  const srcH = first.height ?? 1080;
  const tileW = Math.min(TILE_MAX_WIDTH, srcW);
  const tileH = Math.round((tileW * srcH) / srcW);

  const tiles = await Promise.all(
    frames.map(async (f, i) => {
      const tag = labelSvg(label(f.time), tileH);
      const input = await sharp(f.jpeg)
        .resize(tileW, tileH, { fit: "contain", background: BACKGROUND })
        .composite([{ input: tag, left: 6, top: 6 }])
        .toBuffer();
      return {
        input,
        left: GAP + (i % cols) * (tileW + GAP),
        top: GAP + Math.floor(i / cols) * (tileH + GAP),
      };
    }),
  );

  return sharp({
    create: {
      width: GAP + cols * (tileW + GAP),
      height: GAP + rows * (tileH + GAP),
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite(tiles)
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
