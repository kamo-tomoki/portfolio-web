import type { Stroke, StrokePoint } from "./strokeGenerator";

export interface DOMElementInfo {
  type: "rect" | "svg" | "image" | "hr" | "line";
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };
  borderColor: string;
  borderWidth: number;
  element: Element;
}

export interface ElementStrokes {
  element: DOMElementInfo;
  strokes: Stroke[];
}

/**
 * Parse border-radius values from computed style
 */
function parseBorderRadius(style: CSSStyleDeclaration): DOMElementInfo["borderRadius"] {
  return {
    topLeft: parseFloat(style.borderTopLeftRadius) || 0,
    topRight: parseFloat(style.borderTopRightRadius) || 0,
    bottomRight: parseFloat(style.borderBottomRightRadius) || 0,
    bottomLeft: parseFloat(style.borderBottomLeftRadius) || 0,
  };
}

/**
 * Generate points for a rounded corner
 */
function generateCornerPoints(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  steps: number = 8
): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * Add handwriting-like variation to stroke points
 */
function addHandwritingVariation(
  points: StrokePoint[],
  amplitude: number = 1.5
): StrokePoint[] {
  return points.map((point, index) => {
    const noise = Math.sin(index * 0.3) * amplitude;
    return {
      x: point.x + noise * (Math.random() - 0.5) * 2,
      y: point.y + noise * (Math.random() - 0.5) * 2,
    };
  });
}

/**
 * Generate stroke for a rectangle with optional rounded corners
 */
function generateRectStroke(info: DOMElementInfo): Stroke {
  const { x, y, width, height, borderRadius: br, borderColor } = info;
  const points: StrokePoint[] = [];

  // Clamp radius values to not exceed half of the smaller dimension
  const maxRadius = Math.min(width, height) / 2;
  const tl = Math.min(br.topLeft, maxRadius);
  const tr = Math.min(br.topRight, maxRadius);
  const br_ = Math.min(br.bottomRight, maxRadius);
  const bl = Math.min(br.bottomLeft, maxRadius);

  // Start from top-left after the corner
  if (tl > 0) {
    points.push(...generateCornerPoints(x + tl, y + tl, tl, Math.PI, Math.PI * 1.5));
  } else {
    points.push({ x, y });
  }

  // Top edge to top-right corner
  if (tr > 0) {
    points.push({ x: x + width - tr, y });
    points.push(...generateCornerPoints(x + width - tr, y + tr, tr, -Math.PI / 2, 0));
  } else {
    points.push({ x: x + width, y });
  }

  // Right edge to bottom-right corner
  if (br_ > 0) {
    points.push({ x: x + width, y: y + height - br_ });
    points.push(...generateCornerPoints(x + width - br_, y + height - br_, br_, 0, Math.PI / 2));
  } else {
    points.push({ x: x + width, y: y + height });
  }

  // Bottom edge to bottom-left corner
  if (bl > 0) {
    points.push({ x: x + bl, y: y + height });
    points.push(...generateCornerPoints(x + bl, y + height - bl, bl, Math.PI / 2, Math.PI));
  } else {
    points.push({ x, y: y + height });
  }

  // Close the path
  if (tl > 0) {
    points.push({ x, y: y + tl });
  }
  points.push({ ...points[0] });

  return {
    points: addHandwritingVariation(points),
    color: borderColor,
  };
}

/**
 * Generate stroke for an HR element
 */
function generateHRStroke(info: DOMElementInfo): Stroke {
  const { x, y, width, height, borderColor } = info;
  const centerY = y + height / 2;

  // Create a wavy line for HR
  const points: StrokePoint[] = [];
  const segments = Math.max(10, Math.floor(width / 20));

  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    const px = x + width * progress;
    const waveAmplitude = 2;
    const py = centerY + Math.sin(progress * Math.PI * 4) * waveAmplitude;
    points.push({ x: px, y: py });
  }

  return {
    points: addHandwritingVariation(points, 1),
    color: borderColor,
  };
}

/**
 * Generate stroke for a line element (thin div with background)
 */
function generateLineStroke(info: DOMElementInfo): Stroke {
  const { x, y, width, height, borderColor } = info;

  const points: StrokePoint[] = [];

  if (width > height) {
    // Horizontal line
    const centerY = y + height / 2;
    const segments = Math.max(8, Math.floor(width / 15));

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const px = x + width * progress;
      const waveAmplitude = 1.5;
      const py = centerY + Math.sin(progress * Math.PI * 3) * waveAmplitude;
      points.push({ x: px, y: py });
    }
  } else {
    // Vertical line
    const centerX = x + width / 2;
    const segments = Math.max(8, Math.floor(height / 15));

    for (let i = 0; i <= segments; i++) {
      const progress = i / segments;
      const py = y + height * progress;
      const waveAmplitude = 1.5;
      const px = centerX + Math.sin(progress * Math.PI * 3) * waveAmplitude;
      points.push({ x: px, y: py });
    }
  }

  return {
    points: addHandwritingVariation(points, 1),
    color: borderColor,
  };
}

/**
 * Parse SVG path d attribute to stroke points
 */
function parseSVGPath(d: string, offsetX: number, offsetY: number): StrokePoint[][] {
  const strokes: StrokePoint[][] = [];
  let currentStroke: StrokePoint[] = [];
  let currentX = 0;
  let currentY = 0;
  let startX = 0;
  let startY = 0;

  // Simple SVG path parser (supports M, L, C, Q, Z commands)
  const commands = d.match(/[MLCQZmlcqz][^MLCQZmlcqz]*/g) || [];

  for (const cmd of commands) {
    const type = cmd[0];
    const args = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

    switch (type) {
      case "M":
        if (currentStroke.length > 1) strokes.push(currentStroke);
        currentX = args[0];
        currentY = args[1];
        startX = currentX;
        startY = currentY;
        currentStroke = [{ x: offsetX + currentX, y: offsetY + currentY }];
        break;

      case "m":
        if (currentStroke.length > 1) strokes.push(currentStroke);
        currentX += args[0];
        currentY += args[1];
        startX = currentX;
        startY = currentY;
        currentStroke = [{ x: offsetX + currentX, y: offsetY + currentY }];
        break;

      case "L":
        currentX = args[0];
        currentY = args[1];
        currentStroke.push({ x: offsetX + currentX, y: offsetY + currentY });
        break;

      case "l":
        currentX += args[0];
        currentY += args[1];
        currentStroke.push({ x: offsetX + currentX, y: offsetY + currentY });
        break;

      case "C": {
        const x0 = currentX;
        const y0 = currentY;
        const x1 = args[0], y1 = args[1];
        const x2 = args[2], y2 = args[3];
        const x3 = args[4], y3 = args[5];
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
          const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
          currentStroke.push({ x: offsetX + px, y: offsetY + py });
        }
        currentX = x3;
        currentY = y3;
        break;
      }

      case "c": {
        const x0 = currentX;
        const y0 = currentY;
        const x1 = x0 + args[0], y1 = y0 + args[1];
        const x2 = x0 + args[2], y2 = y0 + args[3];
        const x3 = x0 + args[4], y3 = y0 + args[5];
        const steps = 10;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const px = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
          const py = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
          currentStroke.push({ x: offsetX + px, y: offsetY + py });
        }
        currentX = x3;
        currentY = y3;
        break;
      }

      case "Q": {
        const x0 = currentX;
        const y0 = currentY;
        const x1 = args[0], y1 = args[1];
        const x2 = args[2], y2 = args[3];
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
          const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
          currentStroke.push({ x: offsetX + px, y: offsetY + py });
        }
        currentX = x2;
        currentY = y2;
        break;
      }

      case "q": {
        const x0 = currentX;
        const y0 = currentY;
        const x1 = x0 + args[0], y1 = y0 + args[1];
        const x2 = x0 + args[2], y2 = y0 + args[3];
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
          const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
          currentStroke.push({ x: offsetX + px, y: offsetY + py });
        }
        currentX = x2;
        currentY = y2;
        break;
      }

      case "Z":
      case "z":
        if (currentStroke.length > 0) {
          currentStroke.push({ x: offsetX + startX, y: offsetY + startY });
          strokes.push(currentStroke);
          currentStroke = [];
        }
        currentX = startX;
        currentY = startY;
        break;
    }
  }

  if (currentStroke.length > 1) {
    strokes.push(currentStroke);
  }

  return strokes;
}

/**
 * Generate strokes from SVG element
 */
function generateSVGStrokes(svgElement: SVGElement, offsetX: number, offsetY: number): Stroke[] {
  const strokes: Stroke[] = [];
  const style = window.getComputedStyle(svgElement);
  const color = style.stroke !== "none" ? style.stroke : style.fill !== "none" ? style.fill : "#000000";

  // Handle different SVG element types
  if (svgElement instanceof SVGPathElement) {
    const d = svgElement.getAttribute("d") || "";
    const pathStrokes = parseSVGPath(d, offsetX, offsetY);
    for (const points of pathStrokes) {
      strokes.push({
        points: addHandwritingVariation(points),
        color,
      });
    }
  } else if (svgElement instanceof SVGRectElement) {
    const x = offsetX + (parseFloat(svgElement.getAttribute("x") || "0"));
    const y = offsetY + (parseFloat(svgElement.getAttribute("y") || "0"));
    const w = parseFloat(svgElement.getAttribute("width") || "0");
    const h = parseFloat(svgElement.getAttribute("height") || "0");
    const rx = parseFloat(svgElement.getAttribute("rx") || "0");
    const ry = parseFloat(svgElement.getAttribute("ry") || rx.toString());

    const rectInfo: DOMElementInfo = {
      type: "rect",
      x, y, width: w, height: h,
      borderRadius: { topLeft: rx, topRight: rx, bottomRight: ry, bottomLeft: ry },
      borderColor: color,
      borderWidth: parseFloat(style.strokeWidth) || 1,
      element: svgElement,
    };
    strokes.push(generateRectStroke(rectInfo));
  } else if (svgElement instanceof SVGCircleElement) {
    const cx = offsetX + parseFloat(svgElement.getAttribute("cx") || "0");
    const cy = offsetY + parseFloat(svgElement.getAttribute("cy") || "0");
    const r = parseFloat(svgElement.getAttribute("r") || "0");

    const points = generateCornerPoints(cx, cy, r, 0, Math.PI * 2, 32);
    points.push({ ...points[0] });
    strokes.push({
      points: addHandwritingVariation(points),
      color,
    });
  } else if (svgElement instanceof SVGEllipseElement) {
    const cx = offsetX + parseFloat(svgElement.getAttribute("cx") || "0");
    const cy = offsetY + parseFloat(svgElement.getAttribute("cy") || "0");
    const rx = parseFloat(svgElement.getAttribute("rx") || "0");
    const ry = parseFloat(svgElement.getAttribute("ry") || "0");

    const points: StrokePoint[] = [];
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      points.push({
        x: cx + Math.cos(angle) * rx,
        y: cy + Math.sin(angle) * ry,
      });
    }
    strokes.push({
      points: addHandwritingVariation(points),
      color,
    });
  } else if (svgElement instanceof SVGLineElement) {
    const x1 = offsetX + parseFloat(svgElement.getAttribute("x1") || "0");
    const y1 = offsetY + parseFloat(svgElement.getAttribute("y1") || "0");
    const x2 = offsetX + parseFloat(svgElement.getAttribute("x2") || "0");
    const y2 = offsetY + parseFloat(svgElement.getAttribute("y2") || "0");

    strokes.push({
      points: addHandwritingVariation([{ x: x1, y: y1 }, { x: x2, y: y2 }]),
      color,
    });
  } else if (svgElement instanceof SVGPolygonElement || svgElement instanceof SVGPolylineElement) {
    const pointsAttr = svgElement.getAttribute("points") || "";
    const coords = pointsAttr.trim().split(/[\s,]+/).map(parseFloat);
    const points: StrokePoint[] = [];

    for (let i = 0; i < coords.length; i += 2) {
      points.push({ x: offsetX + coords[i], y: offsetY + coords[i + 1] });
    }

    if (svgElement instanceof SVGPolygonElement && points.length > 0) {
      points.push({ ...points[0] });
    }

    strokes.push({
      points: addHandwritingVariation(points),
      color,
    });
  }

  return strokes;
}

/**
 * Extract edges from an image using Sobel operator
 */
async function extractImageEdges(
  img: HTMLImageElement,
  offsetX: number,
  offsetY: number,
  threshold: number = 50
): Promise<Stroke[]> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  // Scale down for performance
  const maxSize = 200;
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.floor(img.naturalWidth * scale);
  canvas.height = Math.floor(img.naturalHeight * scale);

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Convert to grayscale
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Sobel operator for edge detection
  const edges: { x: number; y: number; strength: number }[] = [];
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          gx += gray[idx] * sobelX[kernelIdx];
          gy += gray[idx] * sobelY[kernelIdx];
        }
      }
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude > threshold) {
        edges.push({
          x: offsetX + x / scale,
          y: offsetY + y / scale,
          strength: magnitude,
        });
      }
    }
  }

  // Connect nearby edge points into strokes
  const strokes: Stroke[] = [];
  const visited = new Set<number>();
  const displayWidth = img.width || img.naturalWidth;
  const displayHeight = img.height || img.naturalHeight;
  const scaleX = displayWidth / img.naturalWidth;
  const scaleY = displayHeight / img.naturalHeight;

  // Simple edge tracing
  for (let i = 0; i < edges.length; i++) {
    if (visited.has(i)) continue;

    const stroke: StrokePoint[] = [];
    const queue = [i];
    visited.add(i);

    while (queue.length > 0) {
      const idx = queue.shift()!;
      const edge = edges[idx];
      stroke.push({
        x: offsetX + (edge.x - offsetX) * scaleX,
        y: offsetY + (edge.y - offsetY) * scaleY,
      });

      // Find nearby unvisited edges
      for (let j = 0; j < edges.length; j++) {
        if (visited.has(j)) continue;
        const dist = Math.sqrt(
          Math.pow(edges[j].x - edge.x, 2) + Math.pow(edges[j].y - edge.y, 2)
        );
        if (dist < 3 / scale) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    if (stroke.length >= 3) {
      strokes.push({
        points: addHandwritingVariation(stroke, 0.5),
        color: "#333333",
      });
    }
  }

  return strokes;
}

interface BorderSides {
  top: { width: number; color: string };
  right: { width: number; color: string };
  bottom: { width: number; color: string };
  left: { width: number; color: string };
}

/**
 * Check border for each side individually
 */
function getBorderSides(style: CSSStyleDeclaration): BorderSides {
  const sides = {
    top: { width: 0, color: "#000000" },
    right: { width: 0, color: "#000000" },
    bottom: { width: 0, color: "#000000" },
    left: { width: 0, color: "#000000" },
  };

  const sideNames = ["Top", "Right", "Bottom", "Left"] as const;
  const sideKeys = ["top", "right", "bottom", "left"] as const;

  for (let i = 0; i < sideNames.length; i++) {
    const sideName = sideNames[i];
    const sideKey = sideKeys[i];
    const width = parseFloat(style[`border${sideName}Width` as keyof CSSStyleDeclaration] as string) || 0;
    const sideStyle = style[`border${sideName}Style` as keyof CSSStyleDeclaration] as string;
    const color = style[`border${sideName}Color` as keyof CSSStyleDeclaration] as string || "#000000";

    if (width > 0 && sideStyle !== "none" && sideStyle !== "hidden") {
      sides[sideKey] = { width, color };
    }
  }

  return sides;
}

/**
 * Check if element has visible border (any side)
 */
function hasVisibleBorder(style: CSSStyleDeclaration): { visible: boolean; width: number; color: string; allSides: boolean } {
  const sides = getBorderSides(style);
  const hasTop = sides.top.width > 0;
  const hasRight = sides.right.width > 0;
  const hasBottom = sides.bottom.width > 0;
  const hasLeft = sides.left.width > 0;

  const visible = hasTop || hasRight || hasBottom || hasLeft;
  const allSides = hasTop && hasRight && hasBottom && hasLeft;

  let maxWidth = 0;
  let borderColor = "#000000";
  for (const side of Object.values(sides)) {
    if (side.width > maxWidth) {
      maxWidth = side.width;
      borderColor = side.color;
    }
  }

  return { visible, width: maxWidth, color: borderColor, allSides };
}

/**
 * Extract DOM elements from container
 */
export function extractElementsFromDOM(container: HTMLElement): DOMElementInfo[] {
  const elements: DOMElementInfo[] = [];
  const processedElements = new Set<Element>();

  function processElement(el: Element) {
    if (processedElements.has(el)) return;
    processedElements.add(el);

    const style = window.getComputedStyle(el);

    // Skip invisible elements
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Handle HR elements
    if (el.tagName === "HR") {
      elements.push({
        type: "hr",
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height || 2,
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        borderColor: style.borderColor || style.color || "#000000",
        borderWidth: parseFloat(style.borderWidth) || 1,
        element: el,
      });
      return;
    }

    // Handle button elements explicitly
    if (el.tagName === "BUTTON" && rect.width > 0 && rect.height > 0) {
      const borderWidth = parseFloat(style.borderTopWidth) || parseFloat(style.borderWidth) || 0;
      const borderColor = style.borderTopColor || style.borderColor || "#000000";
      console.log("Button found:", {
        borderWidth,
        borderColor,
        borderTopWidth: style.borderTopWidth,
        borderStyle: style.borderStyle,
        rect: { width: rect.width, height: rect.height, top: rect.top, left: rect.left }
      });
      if (borderWidth > 0) {
        elements.push({
          type: "rect",
          x: rect.left + scrollX,
          y: rect.top + scrollY,
          width: rect.width,
          height: rect.height,
          borderRadius: parseBorderRadius(style),
          borderColor: borderColor,
          borderWidth: borderWidth,
          element: el,
        });
        return;
      }
    }

    // Handle elements with visible borders
    const borderInfo = hasVisibleBorder(style);
    if (borderInfo.visible && rect.width > 0 && rect.height > 0) {
      if (borderInfo.allSides) {
        // All sides have border - draw as rectangle
        elements.push({
          type: "rect",
          x: rect.left + scrollX,
          y: rect.top + scrollY,
          width: rect.width,
          height: rect.height,
          borderRadius: parseBorderRadius(style),
          borderColor: borderInfo.color,
          borderWidth: borderInfo.width,
          element: el,
        });
      } else {
        // Only some sides have border - draw individual lines
        const sides = getBorderSides(style);
        const x = rect.left + scrollX;
        const y = rect.top + scrollY;
        const w = rect.width;
        const h = rect.height;

        if (sides.top.width > 0) {
          elements.push({
            type: "line",
            x, y,
            width: w, height: sides.top.width,
            borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
            borderColor: sides.top.color,
            borderWidth: sides.top.width,
            element: el,
          });
        }
        if (sides.bottom.width > 0) {
          elements.push({
            type: "line",
            x, y: y + h - sides.bottom.width,
            width: w, height: sides.bottom.width,
            borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
            borderColor: sides.bottom.color,
            borderWidth: sides.bottom.width,
            element: el,
          });
        }
        if (sides.left.width > 0) {
          elements.push({
            type: "line",
            x, y,
            width: sides.left.width, height: h,
            borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
            borderColor: sides.left.color,
            borderWidth: sides.left.width,
            element: el,
          });
        }
        if (sides.right.width > 0) {
          elements.push({
            type: "line",
            x: x + w - sides.right.width, y,
            width: sides.right.width, height: h,
            borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
            borderColor: sides.right.color,
            borderWidth: sides.right.width,
            element: el,
          });
        }
      }
    }

    // Handle thin elements with background (dividers/lines)
    const bgColor = style.backgroundColor;
    const hasBgColor = bgColor && bgColor !== "transparent" && bgColor !== "rgba(0, 0, 0, 0)";
    const isHorizontalLine = rect.height <= 5 && rect.width > 20;
    const isVerticalLine = rect.width <= 5 && rect.height > 20;

    if (hasBgColor && (isHorizontalLine || isVerticalLine) && !borderInfo.visible) {
      elements.push({
        type: "line",
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        borderColor: bgColor,
        borderWidth: Math.max(rect.width, rect.height),
        element: el,
      });
    }

    // Handle images
    if (el.tagName === "IMG" && rect.width > 0 && rect.height > 0) {
      elements.push({
        type: "image",
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        borderRadius: parseBorderRadius(style),
        borderColor: "#333333",
        borderWidth: 1,
        element: el,
      });
    }

    // Handle SVG
    if (el.tagName === "svg" || el.tagName === "SVG") {
      elements.push({
        type: "svg",
        x: rect.left + scrollX,
        y: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        borderColor: "#000000",
        borderWidth: 1,
        element: el,
      });
    }
  }

  // Process all elements
  const allElements = container.querySelectorAll("*");
  allElements.forEach(processElement);

  return elements;
}

/**
 * Generate strokes for a DOM element
 */
export async function generateElementStrokes(info: DOMElementInfo): Promise<ElementStrokes> {
  const strokes: Stroke[] = [];

  switch (info.type) {
    case "rect":
      strokes.push(generateRectStroke(info));
      break;

    case "hr":
      strokes.push(generateHRStroke(info));
      break;

    case "line":
      strokes.push(generateLineStroke(info));
      break;

    case "svg": {
      const svgElement = info.element as SVGSVGElement;
      const children = svgElement.querySelectorAll("path, rect, circle, ellipse, line, polygon, polyline");
      for (const child of children) {
        const svgStrokes = generateSVGStrokes(child as SVGElement, info.x, info.y);
        strokes.push(...svgStrokes);
      }
      break;
    }

    case "image": {
      const imgElement = info.element as HTMLImageElement;
      if (imgElement.complete && imgElement.naturalWidth > 0) {
        const edgeStrokes = await extractImageEdges(imgElement, info.x, info.y);
        strokes.push(...edgeStrokes);
      }
      break;
    }
  }

  return { element: info, strokes };
}

/**
 * Generate strokes for all DOM elements
 */
export async function generateAllElementStrokes(
  container: HTMLElement
): Promise<ElementStrokes[]> {
  const elements = extractElementsFromDOM(container);
  const results = await Promise.all(
    elements.map((el) => generateElementStrokes(el))
  );
  return results.filter((r) => r.strokes.length > 0);
}
