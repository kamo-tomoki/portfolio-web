import { useCallback, useEffect, useRef, useState } from "react";
import { generateAllElementStrokes } from "../utils/elementExtractor";
import { HandwritingRenderer } from "../utils/HandwritingRenderer";
import { generateAllStrokes } from "../utils/strokeGenerator";
import {
  extractTextFromDOM,
  filterVisibleCharacters,
} from "../utils/textExtractor";

interface HandwritingEffectOptions {
  targetSelector: string;
  strokeSpeed?: number;
  delayBetweenChars?: number;
  fontUrl?: string;
  autoStart?: boolean;
  backgroundColor?: string;
  onComplete?: () => void;
  /** Include DOM elements (borders, SVG, images) in handwriting effect */
  includeElements?: boolean;
  /** Draw elements before text (default: true) */
  elementsFirst?: boolean;
}

export function useHandwritingEffect({
  targetSelector,
  strokeSpeed = 800,
  delayBetweenChars = 0.03,
  fontUrl,
  autoStart = true,
  backgroundColor = "#f8f5f0",
  onComplete,
  includeElements = false,
  elementsFirst = true,
}: HandwritingEffectOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HandwritingRenderer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const isInitializedRef = useRef(false);

  const initializeEffect = useCallback(async () => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const element = document.querySelector(targetSelector) as HTMLElement;
    if (!element) {
      console.warn(`Target element not found: ${targetSelector}`);
      return;
    }

    // Temporarily show the element to extract text positions
    element.style.visibility = "visible";

    // Wait for images to load and layout to stabilize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Extract text from DOM
    const allCharacters = extractTextFromDOM(element);
    const visibleCharacters = filterVisibleCharacters(allCharacters);

    // Generate strokes for DOM elements if enabled (must be done while visible)
    let elementStrokeData = null;
    if (includeElements) {
      elementStrokeData = await generateAllElementStrokes(element);
      console.log(`Found ${elementStrokeData.length} elements to draw`);
    }

    // Now hide the element
    element.style.visibility = "hidden";

    if (visibleCharacters.length === 0) {
      console.warn("No visible characters found");
      element.style.visibility = "visible";
      return;
    }

    console.log(`Found ${visibleCharacters.length} characters to draw`);

    // Generate strokes for all characters
    const strokeData = await generateAllStrokes(visibleCharacters, fontUrl);

    // Create renderer
    const renderer = new HandwritingRenderer(canvas, {
      strokeSpeed,
      delayBetweenChars,
      backgroundColor,
    });

    // Add strokes in specified order
    if (elementsFirst && elementStrokeData) {
      renderer.addElementStrokes(elementStrokeData);
      const elementDuration = renderer.getTotalDuration();
      renderer.addCharacterStrokes(strokeData, elementDuration);
    } else {
      renderer.addCharacterStrokes(strokeData);
      if (elementStrokeData) {
        const textDuration = renderer.getTotalDuration();
        renderer.addElementStrokes(elementStrokeData, textDuration);
      }
    }

    rendererRef.current = renderer;

    setIsReady(true);
  }, [
    targetSelector,
    strokeSpeed,
    delayBetweenChars,
    fontUrl,
    backgroundColor,
    includeElements,
    elementsFirst,
  ]);

  const startAnimation = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    setIsAnimating(true);

    // DOM要素の参照を事前に取得
    const element = document.querySelector(targetSelector) as HTMLElement;

    renderer.startAnimation(
      // フェード開始時に呼ばれる（DOM準備用）
      () => {
        if (element) {
          element.style.visibility = "visible";
          element.style.opacity = "0";
        }
      },
      // フェードオプション
      {
        duration: 1.5,
        domDelay: 0,
        fadeOverlap: 0.5, // アニメーション完了の0.5秒前からフェード開始
        onProgress: (canvasOpacity, domOpacity) => {
          // Update canvas opacity
          if (canvasRef.current) {
            canvasRef.current.style.opacity = String(canvasOpacity);
          }
          // Update DOM element opacity
          if (element) {
            element.style.opacity = String(domOpacity);
          }
        },
        onComplete: () => {
          setIsAnimating(false);
          setIsComplete(true);
          onComplete?.();
        },
      }
    );
  }, [targetSelector, onComplete]);

  const setCanvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (canvas && !canvasRef.current) {
        canvasRef.current = canvas;

        // Set background color via CSS immediately
        canvas.style.backgroundColor = backgroundColor;

        // Wait for next frame to ensure DOM is ready
        requestAnimationFrame(() => {
          setTimeout(() => initializeEffect(), 100);
        });
      }
    },
    [initializeEffect, backgroundColor]
  );

  // Auto-start animation when ready
  useEffect(() => {
    if (isReady && autoStart && !isAnimating && !isComplete) {
      startAnimation();
    }
  }, [isReady, autoStart, isAnimating, isComplete, startAnimation]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      rendererRef.current?.resize();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
    };
  }, []);

  return {
    canvasRef: setCanvasRef,
    isReady,
    isAnimating,
    isComplete,
    startAnimation,
  };
}
