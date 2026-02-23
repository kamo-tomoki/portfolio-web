import { useHandwritingEffect } from "../hooks/useHandwritingEffect";
import { Home } from "./Home";

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

  return (
    <div style={appStyles.app}>
      <div style={appStyles.contentWrapper}>
        <div
          className="page-content"
          style={{
            ...appStyles.pageContent,
            visibility: isComplete ? "visible" : "hidden",
          }}
        >
          <Home />
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
    </div>
  );
}
