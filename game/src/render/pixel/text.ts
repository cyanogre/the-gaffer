let measureCtx: CanvasRenderingContext2D | null = null;
export function pixelTextWidth(text: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = '8px Silkscreen, monospace';
  return Math.ceil(measureCtx.measureText(text).width);
}

/** Texto nítido a 8 px: se rasteriza y se umbraliza para que no haya antialias. */
export function pixelText(g: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, maxW = 400) {
  const t = document.createElement('canvas');
  t.width = Math.ceil(Math.max(8, maxW)) + 4;
  t.height = 10;
  const c = t.getContext('2d')!;
  c.font = '8px Silkscreen, monospace';
  c.textBaseline = 'top';
  const w = Math.min(maxW, Math.ceil(c.measureText(text).width));
  c.fillStyle = '#fff';
  c.fillText(text, 0, 0, Math.max(8, maxW));
  const img = c.getImageData(0, 0, t.width, t.height);
  g.fillStyle = color;
  const x0 = Math.round(cx - w / 2);
  for (let yy = 0; yy < t.height; yy++)
    for (let xx = 0; xx < w; xx++) if (img.data[(yy * t.width + xx) * 4 + 3] > 110) g.fillRect(x0 + xx, y + yy - 1, 1, 1);
}
