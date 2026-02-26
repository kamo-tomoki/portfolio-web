import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { InkDiffusion } from "../utils/InkDiffusion";

export interface InkTransitionHandle {
  /** Load text as ink and start fluid dissolution */
  dissolveText: (sourceCanvas: HTMLCanvasElement) => void;
  /** Clear all ink immediately */
  clear: () => void;
}

export const InkTransitionOverlay = forwardRef<InkTransitionHandle>(
  function InkTransitionOverlay(_, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simRef = useRef<InkDiffusion | null>(null);
    const phaseRef = useRef<"idle" | "dissolving">("idle");
    const startRef = useRef(0);

    useImperativeHandle(ref, () => ({
      dissolveText(sourceCanvas: HTMLCanvasElement) {
        const sim = simRef.current;
        if (!sim) return;
        sim.clear();
        sim.loadInkFromCanvas(sourceCanvas, 1.2);
        phaseRef.current = "dissolving";
        startRef.current = 0;
      },
      clear() {
        simRef.current?.clear();
        phaseRef.current = "idle";
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;

      let running = true;
      let lastTime = performance.now();

      InkDiffusion.create(canvas, 384, "dark").then((sim) => {
        if (!running) {
          sim.dispose();
          return;
        }
        simRef.current = sim;

        function animate(now: number) {
          if (!running) return;
          lastTime = now;

          if (phaseRef.current === "dissolving") {
            if (startRef.current === 0) startRef.current = now;
            const elapsed = now - startRef.current;
            const DURATION = 1500;
            const t = elapsed / DURATION;

            // Pure diffusion — ink spreads isotropically like にじみ
            // Diffusion rate increases over time for acceleration
            if (t < 0.15) {
              // Brief hold: very low diffusion, ink barely moves
              sim.step(0.04, 1);
            } else if (t < 0.4) {
              // Gentle spread begins
              sim.step(0.10, 2);
            } else if (t < 0.65) {
              // Medium diffusion
              sim.step(0.18, 3);
            } else if (t < 0.85) {
              // Strong diffusion — ink spreads rapidly
              sim.step(0.24, 4);
            } else {
              sim.step(0.30, 4);
            }

            // Fade: gentle at first, very aggressive at end
            if (t < 0.15) {
              sim.fadeInk(0.999);
            } else if (t < 0.35) {
              sim.fadeInk(0.993);
            } else if (t < 0.5) {
              sim.fadeInk(0.975);
            } else if (t < 0.6) {
              sim.fadeInk(0.92);
            } else {
              sim.fadeInk(0.72);
            }

            sim.render();

            if (elapsed >= DURATION) {
              sim.clear();
              sim.render(); // render cleared (transparent) state
              phaseRef.current = "idle";
            }
          }

          requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
      });

      const onResize = () => {
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        simRef.current?.resize(canvas.width, canvas.height);
      };
      window.addEventListener("resize", onResize);

      return () => {
        running = false;
        window.removeEventListener("resize", onResize);
        simRef.current?.dispose();
      };
    }, []);

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 20,
        }}
      />
    );
  }
);
