import { useEffect, useRef } from "react";
import { FluidSimulation } from "../utils/FluidSimulation";

// Import stroke data for each character
import kuuData from "hanzi-writer-data/空.json";
import souData from "hanzi-writer-data/創.json";
import muData from "hanzi-writer-data/無.json";
import genData from "hanzi-writer-data/幻.json";

interface CharData {
  medians: number[][][];
}

const CHARS: CharData[] = [kuuData, souData, muData, genData];

// Timing (ms)
const STROKE_SPEED = 0.4; // seconds per stroke (base, scaled by length)
const STROKE_GAP = 80; // ms between strokes
const HOLD_TIME = 2500; // ms to hold after all strokes
const FADE_TIME = 2000; // ms to fade out
const PAUSE_TIME = 800; // ms between characters

// Convert hanzi-writer coords (1024x1024, Y-up cartesian) to UV (0-1)
// hanzi-writer Y-up matches WebGL UV Y-up, so no flip needed
function toUV(
  pt: number[],
  padding = 0.1
): [number, number] {
  const scale = 1 - padding * 2;
  const u = padding + (pt[0] / 1024) * scale;
  const v = padding + (pt[1] / 1024) * scale;
  return [u, v];
}

// Compute arc-length parameterized points along a stroke's median
function interpolateStroke(
  median: number[][],
  steps: number
): [number, number][] {
  if (median.length < 2) return [toUV(median[0])];

  // Compute cumulative arc lengths
  const dists: number[] = [0];
  for (let i = 1; i < median.length; i++) {
    const dx = median[i][0] - median[i - 1][0];
    const dy = median[i][1] - median[i - 1][1];
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const totalLen = dists[dists.length - 1];

  const points: [number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const targetDist = (s / steps) * totalLen;
    // Find segment
    let seg = 0;
    while (seg < dists.length - 2 && dists[seg + 1] < targetDist) seg++;
    const segLen = dists[seg + 1] - dists[seg];
    const t = segLen > 0 ? (targetDist - dists[seg]) / segLen : 0;
    const x = median[seg][0] + t * (median[seg + 1][0] - median[seg][0]);
    const y = median[seg][1] + t * (median[seg + 1][1] - median[seg][1]);
    points.push(toUV([x, y]));
  }
  return points;
}

// Compute stroke length in hanzi coords
function strokeLength(median: number[][]): number {
  let len = 0;
  for (let i = 1; i < median.length; i++) {
    const dx = median[i][0] - median[i - 1][0];
    const dy = median[i][1] - median[i - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

export function ShodoCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    let sim: FluidSimulation;
    try {
      sim = new FluidSimulation(canvas, 768);
    } catch {
      return; // WebGL2 not available
    }

    let running = true;
    let charIdx = 0;
    let phase: "draw" | "hold" | "fade" | "pause" = "draw";
    let phaseStart = performance.now();
    let strokeIdx = 0;
    let strokeProgress = 0; // 0-1 within current stroke
    let prevPoint: [number, number] | null = null;

    // Pre-compute interpolated paths for current character
    let strokePaths: [number, number][][] = [];
    let strokeDurations: number[] = [];

    function prepareChar(idx: number) {
      const data = CHARS[idx];
      strokePaths = data.medians.map((m) => {
        const len = strokeLength(m);
        const steps = Math.max(20, Math.round(len / 8));
        return interpolateStroke(m, steps);
      });
      strokeDurations = data.medians.map((m) => {
        const len = strokeLength(m);
        return Math.max(200, STROKE_SPEED * len);
      });
      strokeIdx = 0;
      strokeProgress = 0;
      prevPoint = null;
    }

    prepareChar(0);

    let strokeStartTime = performance.now();
    let lastTime = performance.now();

    function animate(now: number) {
      if (!running) return;
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      switch (phase) {
        case "draw": {
          const currentDuration = strokeDurations[strokeIdx];
          const elapsed = now - strokeStartTime;
          strokeProgress = Math.min(elapsed / currentDuration, 1);

          const path = strokePaths[strokeIdx];
          const pointIdx = Math.floor(strokeProgress * (path.length - 1));
          const pt = path[Math.min(pointIdx, path.length - 1)];

          if (prevPoint) {
            const rawDx = pt[0] - prevPoint[0];
            const rawDy = pt[1] - prevPoint[1];
            // Velocity for fluid motion (moderate so ink doesn't fly away)
            const dx = rawDx * 40;
            const dy = rawDy * 40;
            // Speed in UV space for brush dynamics
            const rawSpeed = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
            // Slower = more ink, like a real brush pressing down
            const inkAmt = Math.max(0.3, 0.8 - rawSpeed * 8);
            // Brush radius: thicker strokes (~3-4% of screen)
            const radius = 0.0004 + 0.0002 * (1 - Math.min(rawSpeed * 10, 0.8));
            sim.splat(pt[0], pt[1], dx, dy, inkAmt, radius);
          }
          prevPoint = pt;

          // Move to next stroke or hold phase
          if (strokeProgress >= 1) {
            strokeIdx++;
            if (strokeIdx >= strokePaths.length) {
              phase = "hold";
              phaseStart = now;
            } else {
              strokeProgress = 0;
              strokeStartTime = now + STROKE_GAP;
              prevPoint = null;
            }
          }
          break;
        }

        case "hold": {
          if (now - phaseStart >= HOLD_TIME) {
            phase = "fade";
            phaseStart = now;
          }
          break;
        }

        case "fade": {
          const fadeProgress = (now - phaseStart) / FADE_TIME;
          // Gradually reduce ink
          sim.fadeInk(0.96);
          if (fadeProgress >= 1) {
            sim.clear();
            phase = "pause";
            phaseStart = now;
          }
          break;
        }

        case "pause": {
          if (now - phaseStart >= PAUSE_TIME) {
            charIdx = (charIdx + 1) % CHARS.length;
            prepareChar(charIdx);
            phase = "draw";
            phaseStart = now;
            strokeStartTime = now;
          }
          break;
        }
      }

      sim.step(dt);
      sim.render();

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);

    const onResize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      window.removeEventListener("resize", onResize);
      sim.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
