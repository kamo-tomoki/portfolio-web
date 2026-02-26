import { useRef, useEffect, useState } from "react";
import { useHandwritingEffect } from "../hooks/useHandwritingEffect";
import { usePageTransition } from "../hooks/usePageTransition";
import { Home } from "./Home";
import { Works } from "./Works";
import { InkCursor } from "./InkCursor";
import { InkTransitionOverlay, type InkTransitionHandle } from "./InkTransitionOverlay";
import type { ShodoCanvasHandle } from "./ShodoCanvas";
import { gatherTextElements, renderTextToCanvas } from "../utils/renderTextToCanvas";

const appStyles = {
  app: {
    position: "relative" as const,
    width: "100%",
    minHeight: "100vh",
  },
  contentWrapper: {
    position: "relative" as const,
    zIndex: 1,
    width: "100%",
    height: "100%",
  },
  pageContent: {
    width: "100%",
    minHeight: "100vh",
  },
  liquidCanvas: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    zIndex: 10,
    pointerEvents: "none" as const,
  },
};

export default function HandwritingApp() {
  const { canvasRef, isComplete } = useHandwritingEffect({
    targetSelector: ".page-content",
    strokeSpeed: 3000,
    delayBetweenChars: 0.015,
    backgroundColor: "#ffffff",
    fontUrl: "/fonts/NotoSansJP-Regular.otf",
    includeElements: true,
    elementsFirst: false,
    onComplete: () => {
      console.log("Handwriting animation complete!");
    },
  });

  const {
    phase,
    currentPage,
    startTransition,
    contentOpacity,
  } = usePageTransition();

  const shodoRef = useRef<ShodoCanvasHandle | null>(null);
  const overlayRef = useRef<InkTransitionHandle | null>(null);
  const [forceHideContent, setForceHideContent] = useState(false);

  // Coordinate transition effects
  useEffect(() => {
    if (phase === "fadeOut") {
      if (currentPage === "home") {
        // Capture text positions before hiding
        const textElements = gatherTextElements();
        const textCanvas = renderTextToCanvas(
          textElements,
          window.innerWidth,
          window.innerHeight
        );

        // Load text as ink and start fluid dissolution
        overlayRef.current?.dissolveText(textCanvas);
        // ShodoCanvas ink dissolves with fluid simulation
        shodoRef.current?.triggerTransitionFade();
        // Hide DOM text instantly — overlay now shows it as ink
        setForceHideContent(true);
      }
    } else if (phase === "fadeIn" || phase === "idle") {
      setForceHideContent(false);
    }
  }, [phase, currentPage]);

  const effectiveOpacity = forceHideContent ? 0 : contentOpacity;

  return (
    <div style={appStyles.app}>
      <div style={appStyles.contentWrapper}>
        <div
          className="page-content"
          style={{
            ...appStyles.pageContent,
            visibility: isComplete ? "visible" : "hidden",
            opacity: effectiveOpacity,
          }}
        >
          {currentPage === "home" ? (
            <Home onNavigate={startTransition} shodoRef={shodoRef} />
          ) : (
            <Works onNavigateHome={() => startTransition("home")} />
          )}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          ...appStyles.liquidCanvas,
          pointerEvents: isComplete ? "none" : "auto",
          display: isComplete ? "none" : "block",
        }}
      />
      <InkTransitionOverlay ref={overlayRef} />
      <InkCursor />
    </div>
  );
}
