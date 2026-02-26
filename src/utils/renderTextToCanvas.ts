export interface TextElement {
  text: string;
  rect: DOMRect;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
}

export function gatherTextElements(): TextElement[] {
  const nodes = document.querySelectorAll("[data-dissolve='text']");
  const elements: TextElement[] = [];

  for (const node of nodes) {
    const el = node as HTMLElement;
    const rect = el.getBoundingClientRect();
    const computed = window.getComputedStyle(el);
    elements.push({
      text: el.textContent || "",
      rect,
      fontSize: parseFloat(computed.fontSize),
      fontWeight: computed.fontWeight,
      fontFamily: computed.fontFamily,
    });
  }

  return elements;
}

export interface CanvasSource {
  canvas: HTMLCanvasElement;
  rect: DOMRect;
}

export function renderTextToCanvas(
  elements: TextElement[],
  width: number,
  height: number,
  dpr: number = window.devicePixelRatio || 1,
  canvasSources: CanvasSource[] = []
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  for (const el of elements) {
    ctx.save();
    ctx.font = `${el.fontWeight} ${el.fontSize}px ${el.fontFamily}`;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "top";
    ctx.fillText(el.text, el.rect.left, el.rect.top);
    ctx.restore();
  }

  // Composite additional canvas sources (e.g. ShodoCanvas)
  for (const src of canvasSources) {
    ctx.drawImage(src.canvas, src.rect.left, src.rect.top, src.rect.width, src.rect.height);
  }

  return canvas;
}
