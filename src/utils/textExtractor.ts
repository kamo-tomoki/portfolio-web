export interface TextCharacter {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  element: Element;
}

export interface TextLine {
  characters: TextCharacter[];
  y: number;
}

/**
 * Extract text characters from DOM elements with their positions and styles
 */
export function extractTextFromDOM(
  container: HTMLElement
): TextCharacter[] {
  const characters: TextCharacter[] = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const text = textNode.textContent || "";
    const parent = textNode.parentElement;

    if (!parent || !text.trim()) continue;

    // Skip hidden elements
    const computedStyle = window.getComputedStyle(parent);
    if (
      computedStyle.display === "none" ||
      computedStyle.visibility === "hidden" ||
      computedStyle.opacity === "0"
    ) {
      continue;
    }

    const range = document.createRange();

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      // Skip whitespace-only characters (but keep track of spaces for positioning)
      if (char === "\n" || char === "\r" || char === "\t") continue;

      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);

      const rect = range.getBoundingClientRect();

      // Skip zero-width characters
      if (rect.width === 0 && char !== " ") continue;

      const fontSize = parseFloat(computedStyle.fontSize);

      characters.push({
        char,
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width || fontSize * 0.3, // Approximate width for spaces
        height: rect.height,
        fontSize,
        fontFamily: computedStyle.fontFamily,
        fontWeight: computedStyle.fontWeight,
        color: computedStyle.color,
        element: parent,
      });
    }
  }

  return characters;
}

/**
 * Group characters into lines based on Y position
 */
export function groupCharactersIntoLines(
  characters: TextCharacter[],
  threshold = 5
): TextLine[] {
  if (characters.length === 0) return [];

  const sorted = [...characters].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > threshold) return yDiff;
    return a.x - b.x;
  });

  const lines: TextLine[] = [];
  let currentLine: TextCharacter[] = [];
  let currentY = sorted[0].y;

  for (const char of sorted) {
    if (Math.abs(char.y - currentY) > threshold) {
      if (currentLine.length > 0) {
        lines.push({
          characters: currentLine,
          y: currentY,
        });
      }
      currentLine = [char];
      currentY = char.y;
    } else {
      currentLine.push(char);
    }
  }

  if (currentLine.length > 0) {
    lines.push({
      characters: currentLine,
      y: currentY,
    });
  }

  // Sort characters within each line by x position
  for (const line of lines) {
    line.characters.sort((a, b) => a.x - b.x);
  }

  return lines;
}

/**
 * Filter to only visible characters (non-space, visible area)
 */
export function filterVisibleCharacters(
  characters: TextCharacter[],
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight
): TextCharacter[] {
  return characters.filter((char) => {
    // Skip spaces
    if (char.char === " ") return false;

    // Check if in viewport
    if (
      char.x + char.width < 0 ||
      char.x > viewportWidth ||
      char.y + char.height < 0 ||
      char.y > viewportHeight
    ) {
      return false;
    }

    return true;
  });
}
