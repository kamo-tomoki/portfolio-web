import { useEffect, useRef } from "react";
import { FluidSimulation } from "../utils/FluidSimulation";

const SIM_RES = 256;
const LERP_SPEED = 0.15;
const INK_FADE = 0.982;

export function InkCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;

    let sim: FluidSimulation;
    try {
      sim = new FluidSimulation(canvas, SIM_RES, true);
    } catch {
      return;
    }

    let running = true;
    let lastTime = performance.now();

    // Raw mouse position (updated on mousemove)
    const mouse = { x: -1, y: -1 };
    // Smoothed position (lerped each frame)
    const smooth = { x: -1, y: -1 };
    const prevSmooth = { x: -1, y: -1 };
    let hasMoved = false;

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = 1 - e.clientY / window.innerHeight;

      if (!hasMoved) {
        // Initialize smooth position on first move (no lerp jump)
        smooth.x = mouse.x;
        smooth.y = mouse.y;
        prevSmooth.x = mouse.x;
        prevSmooth.y = mouse.y;
        hasMoved = true;
      }
    };

    const handleMouseLeave = () => {
      hasMoved = false;
      mouse.x = -1;
      mouse.y = -1;
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    function animate(now: number) {
      if (!running) return;
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      if (hasMoved && mouse.x >= 0) {
        // Save previous smooth position
        prevSmooth.x = smooth.x;
        prevSmooth.y = smooth.y;

        // Lerp towards actual mouse position for smooth trail
        smooth.x += (mouse.x - smooth.x) * LERP_SPEED;
        smooth.y += (mouse.y - smooth.y) * LERP_SPEED;

        // Compute velocity from smoothed movement
        const dx = (smooth.x - prevSmooth.x) * 25;
        const dy = (smooth.y - prevSmooth.y) * 25;
        const speed = Math.sqrt(dx * dx + dy * dy);

        if (speed > 0.0005) {
          // Slower movement = more ink (like pressing a brush down)
          const inkAmt = Math.max(0.1, 0.45 - speed * 3);
          // Brush radius: larger when slow
          const radius =
            0.000336 + 0.000168 * (1 - Math.min(speed * 5, 0.8));
          sim.splat(smooth.x, smooth.y, dx, dy, inkAmt, radius);
        }
      }

      // Continuously fade ink for the disappearing trail effect
      sim.fadeInk(INK_FADE);
      sim.step(dt);
      sim.render();

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    const onResize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      sim.resize(canvas.width, canvas.height);
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", onResize);
      sim.dispose();
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
        zIndex: 9999,
      }}
    />
  );
}
