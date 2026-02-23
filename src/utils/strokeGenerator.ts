import opentype from "opentype.js";
import type { TextCharacter } from "./textExtractor";

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
}

export interface CharacterStrokes {
  character: TextCharacter;
  strokes: Stroke[];
}

// Cache for loaded fonts
const fontCache = new Map<string, opentype.Font>();

// Default font URL (local Roboto font)
const DEFAULT_FONT_URL = "/fonts/Roboto-Regular.ttf";

/**
 * Load a font from URL using fetch and parse
 */
async function loadFont(url: string): Promise<opentype.Font | null> {
  if (fontCache.has(url)) {
    return fontCache.get(url)!;
  }

  try {
    console.log("Loading font from:", url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const font = opentype.parse(arrayBuffer);
    console.log("Font loaded successfully:", font.names.fontFamily);
    fontCache.set(url, font);
    return font;
  } catch (error) {
    console.error("Failed to load font:", url, error);
    return null;
  }
}

/**
 * Convert opentype.js path commands to stroke points
 * opentype.js uses upward Y-axis (same as Three.js default)
 * No flipping needed when using Three.js camera with top < bottom
 */
function pathToStrokes(path: opentype.Path): StrokePoint[][] {
  const strokes: StrokePoint[][] = [];
  let currentStroke: StrokePoint[] = [];

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case "M":
        if (currentStroke.length > 1) {
          strokes.push(currentStroke);
        }
        currentStroke = [{ x: cmd.x!, y: cmd.y! }];
        break;

      case "L":
        currentStroke.push({ x: cmd.x!, y: cmd.y! });
        break;

      case "C": {
        const steps = 10;
        const x0 =
          currentStroke.length > 0
            ? currentStroke[currentStroke.length - 1].x
            : cmd.x!;
        const y0 =
          currentStroke.length > 0
            ? currentStroke[currentStroke.length - 1].y
            : cmd.y!;
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const x =
            mt * mt * mt * x0 +
            3 * mt * mt * t * cmd.x1! +
            3 * mt * t * t * cmd.x2! +
            t * t * t * cmd.x!;
          const y =
            mt * mt * mt * y0 +
            3 * mt * mt * t * cmd.y1! +
            3 * mt * t * t * cmd.y2! +
            t * t * t * cmd.y!;
          currentStroke.push({ x, y });
        }
        break;
      }

      case "Q": {
        const steps = 8;
        const x0 =
          currentStroke.length > 0
            ? currentStroke[currentStroke.length - 1].x
            : cmd.x!;
        const y0 =
          currentStroke.length > 0
            ? currentStroke[currentStroke.length - 1].y
            : cmd.y!;

        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const mt = 1 - t;
          const x = mt * mt * x0 + 2 * mt * t * cmd.x1! + t * t * cmd.x!;
          const y = mt * mt * y0 + 2 * mt * t * cmd.y1! + t * t * cmd.y!;
          currentStroke.push({ x, y });
        }
        break;
      }

      case "Z":
        if (currentStroke.length > 0) {
          currentStroke.push({ ...currentStroke[0] });
          strokes.push(currentStroke);
          currentStroke = [];
        }
        break;
    }
  }

  if (currentStroke.length > 1) {
    strokes.push(currentStroke);
  }

  return strokes;
}

/**
 * Add handwriting-like variation to stroke points
 */
function addHandwritingVariation(
  points: StrokePoint[],
  amplitude: number = 0.5
): StrokePoint[] {
  return points.map((point, index) => {
    // Add subtle random variation
    const noise = Math.sin(index * 0.5) * amplitude;
    return {
      x: point.x + noise * (Math.random() - 0.5),
      y: point.y + noise * (Math.random() - 0.5),
    };
  });
}

/**
 * Simplify stroke by removing points that are too close together
 */
function simplifyStroke(
  points: StrokePoint[],
  minDistance: number = 2
): StrokePoint[] {
  if (points.length < 2) return points;

  const simplified: StrokePoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const lastPoint = simplified[simplified.length - 1];
    const point = points[i];
    const distance = Math.sqrt(
      Math.pow(point.x - lastPoint.x, 2) + Math.pow(point.y - lastPoint.y, 2)
    );

    if (distance >= minDistance || i === points.length - 1) {
      simplified.push(point);
    }
  }

  return simplified;
}

/**
 * Create simple line strokes for a character (fallback when font not available)
 */
function createSimpleCharacterStrokes(character: TextCharacter): Stroke[] {
  const { x, y, width, height, color } = character;

  // Create simple strokes that simulate the character outline
  return [
    {
      points: [
        { x: x, y: y },
        { x: x + width, y: y },
        { x: x + width, y: y + height },
        { x: x, y: y + height },
        { x: x, y: y },
      ],
      color,
    },
  ];
}

/**
 * Generate strokes for a character using font glyph data
 */
export async function generateCharacterStrokes(
  character: TextCharacter,
  font: opentype.Font | null
): Promise<CharacterStrokes> {
  // If no font available, use simple fallback
  if (!font) {
    console.warn("No font available for character:", character.char);
    return {
      character,
      strokes: createSimpleCharacterStrokes(character),
    };
  }

  try {
    // Get the glyph path at the character's DOM position
    // getPath(text, x, y, fontSize) where y is the baseline position
    // Calculate baseline from font metrics
    const scale = character.fontSize / font.unitsPerEm;
    const ascender = font.ascender * scale;
    const descender = Math.abs(font.descender) * scale;
    const fontTotalHeight = ascender + descender;

    // DOM bounding box includes ascender and descender
    // Baseline is at: top + (ascender / totalHeight) * boundingBoxHeight
    const baselineY = character.y + (ascender / fontTotalHeight) * character.height;

    const path = font.getPath(
      character.char,
      character.x,
      baselineY,
      character.fontSize
    );

    console.log(
      `Character "${character.char}" path commands:`,
      path.commands.length
    );

    // Convert path to strokes (use opentype.js coordinates directly)
    const rawStrokes = pathToStrokes(path);

    console.log(
      `Character "${character.char}" raw strokes:`,
      rawStrokes.length
    );

    // If no strokes generated (e.g., space character), skip
    if (rawStrokes.length === 0) {
      return {
        character,
        strokes: [],
      };
    }

    // Process strokes with font-size-aware parameters
    // Scale with font size but clamp to reasonable range
    const variationAmplitude = Math.min(character.fontSize * 0.015, 0.8);
    const simplifyThreshold = Math.max(0.5, Math.min(character.fontSize * 0.05, 2));

    const strokes: Stroke[] = rawStrokes.map((points) => ({
      points: simplifyStroke(
        addHandwritingVariation(points, variationAmplitude),
        simplifyThreshold
      ),
      color: character.color,
    }));

    return {
      character,
      strokes,
    };
  } catch (error) {
    console.warn(`Failed to generate strokes for "${character.char}":`, error);
    return {
      character,
      strokes: createSimpleCharacterStrokes(character),
    };
  }
}

/**
 * Generate strokes for multiple characters
 */
export async function generateAllStrokes(
  characters: TextCharacter[],
  fontUrl: string = DEFAULT_FONT_URL
): Promise<CharacterStrokes[]> {
  // Preload font
  const font = await loadFont(fontUrl);

  if (!font) {
    console.warn("Font not available, using fallback strokes");
  }

  // Generate strokes for all characters
  const results = await Promise.all(
    characters.map((char) => generateCharacterStrokes(char, font))
  );

  return results;
}

/**
 * Estimate total stroke length for animation timing
 */
export function calculateTotalStrokeLength(strokes: Stroke[]): number {
  let total = 0;

  for (const stroke of strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      const dx = stroke.points[i].x - stroke.points[i - 1].x;
      const dy = stroke.points[i].y - stroke.points[i - 1].y;
      total += Math.sqrt(dx * dx + dy * dy);
    }
  }

  return total;
}
