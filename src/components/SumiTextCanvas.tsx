import { useEffect, useRef } from "react";
import { FluidSimulation } from "../utils/FluidSimulation";

// ---------------------------------------------------------------------------
// Stroke median data for each letter.
// Each letter: array of strokes; each stroke: array of [x, y] in 0‑100 local
// coordinates. X = left→right, Y = top→bottom.
// These are centre-line paths a brush follows (like hanzi-writer medians).
// ---------------------------------------------------------------------------
const STROKES: Record<string, number[][][]> = {
  S: [
    [[72, 15], [55, 5], [35, 8], [20, 20], [22, 40], [42, 50], [62, 55], [78, 68], [78, 82], [60, 93], [38, 93], [22, 82]],
  ],
  o: [
    [[50, 20], [28, 30], [20, 50], [28, 72], [50, 80], [72, 72], [80, 50], [72, 30], [50, 20]],
  ],
  f: [
    [[70, 5], [52, 2], [42, 14], [40, 30], [40, 95]],
    [[20, 38], [62, 38]],
  ],
  t: [
    [[48, 5], [48, 80], [62, 90]],
    [[26, 35], [70, 35]],
  ],
  w: [
    [[8, 25], [28, 88], [50, 42]],
    [[50, 42], [72, 88], [92, 25]],
  ],
  a: [
    [[70, 38], [55, 22], [32, 22], [18, 38], [18, 64], [32, 80], [55, 80], [70, 64]],
    [[70, 22], [70, 90]],
  ],
  r: [
    [[30, 28], [30, 90]],
    [[30, 38], [44, 24], [62, 22], [74, 30]],
  ],
  e: [
    [[20, 52], [80, 52], [80, 30], [62, 18], [38, 18], [20, 32], [20, 68], [38, 82], [62, 82], [80, 70]],
  ],
  E: [
    [[28, 8], [28, 92]],
    [[28, 8], [76, 8]],
    [[28, 48], [66, 48]],
    [[28, 92], [76, 92]],
  ],
  n: [
    [[26, 28], [26, 90]],
    [[26, 38], [44, 22], [62, 22], [74, 38], [74, 90]],
  ],
  g: [
    [[70, 38], [55, 22], [32, 22], [18, 38], [18, 62], [32, 78], [55, 78], [70, 62]],
    [[70, 22], [70, 100], [55, 115], [36, 108]],
  ],
  i: [
    [[50, 6], [50, 14]],
    [[50, 30], [50, 90]],
  ],
};

// Relative width of each letter (1.0 = standard square cell).
const WIDTHS: Record<string, number> = {
  S: 0.88, o: 0.82, f: 0.56, t: 0.54, w: 1.14, a: 0.84, r: 0.58,
  e: 0.82, E: 0.82, n: 0.82, g: 0.84, i: 0.36,
};

const LINES = ["Software", "Engineer"];

// Timing
const STROKE_SPEED = 0.6;   // ms per local-unit of stroke length (slower = denser splats)
const STROKE_GAP = 70;      // ms between strokes in a char
const CHAR_GAP = 100;       // ms between characters
const LINE_GAP = 180;       // ms between lines
const INITIAL_DELAY = 350;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sLen(pts: number[][]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    l += Math.sqrt(dx * dx + dy * dy);
  }
  return l;
}

/** Arc-length parameterised interpolation → UV coords */
function interp(
  pts: number[][],
  steps: number,
  left: number,
  top: number,
  w: number,
  h: number,
): [number, number][] {
  const toUV = (lx: number, ly: number): [number, number] => [
    left + (lx / 100) * w,
    top - (ly / 100) * h, // Y-up UV
  ];

  if (pts.length < 2) return [toUV(pts[0][0], pts[0][1])];

  const d = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    d.push(d[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = d[d.length - 1];

  const out: [number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const tgt = (s / steps) * total;
    let seg = 0;
    while (seg < d.length - 2 && d[seg + 1] < tgt) seg++;
    const sl = d[seg + 1] - d[seg];
    const t = sl > 0 ? (tgt - d[seg]) / sl : 0;
    const x = pts[seg][0] + t * (pts[seg + 1][0] - pts[seg][0]);
    const y = pts[seg][1] + t * (pts[seg + 1][1] - pts[seg][1]);
    out.push(toUV(x, y));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SumiTextCanvas() {
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
      return;
    }

    let running = true;

    // ---------- layout ----------
    const cW = rect.width;
    const cH = rect.height;

    // Compute width of each line in proportion units
    const lineUnits = LINES.map((l) => {
      let w = 0;
      for (const ch of l) w += WIDTHS[ch] ?? 0.7;
      return w;
    });
    const maxUnits = Math.max(...lineUnits);

    // Character cell height = 1.35 × cell unit width (in pixels)
    const totalHeightUnits =
      LINES.length * 1.35 + (LINES.length - 1) * 0.35;
    const pxPerUnit = Math.min(
      (cW * 0.78) / maxUnits,
      (cH * 0.78) / totalHeightUnits,
    );

    // UV conversions
    const cellH_uv = (1.35 * pxPerUnit) / cH;
    const gapH_uv = (0.35 * pxPerUnit) / cH;
    const totalH_uv =
      LINES.length * cellH_uv + (LINES.length - 1) * gapH_uv;
    const textTop = 0.5 + totalH_uv / 2;

    // ---------- build stroke list ----------
    interface Anim {
      pts: [number, number][];
      dur: number;
      pause: number;
    }
    const anims: Anim[] = [];

    for (let li = 0; li < LINES.length; li++) {
      const line = LINES[li];
      const lineW_uv = (lineUnits[li] * pxPerUnit) / cW;
      let cx = 0.5 - lineW_uv / 2;
      const cy = textTop - li * (cellH_uv + gapH_uv);

      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        const chW_uv = ((WIDTHS[ch] ?? 0.7) * pxPerUnit) / cW;
        const medians = STROKES[ch];

        if (medians) {
          for (let si = 0; si < medians.length; si++) {
            const m = medians[si];
            const len = sLen(m);
            // Dense interpolation: enough points so adjacent splats overlap
            const steps = Math.max(40, Math.round(len / 2));
            const pts = interp(m, steps, cx, cy, chW_uv, cellH_uv);
            // Slower animation: more time per stroke
            const dur = Math.max(200, STROKE_SPEED * len);
            const last = si === medians.length - 1;
            const lastChar = ci === line.length - 1;
            const lastLine = li === LINES.length - 1;

            let pause = STROKE_GAP;
            if (last && !lastChar) pause = CHAR_GAP;
            if (last && lastChar && !lastLine) pause = LINE_GAP;

            anims.push({ pts, dur, pause });
          }
        }
        cx += chW_uv;
      }
    }

    // ---------- brush parameters ----------
    // Scale proportionally to character size (ShodoCanvas: 0.8 UV → 0.000288)
    const sizeRatio = cellH_uv / 0.8;
    const radiusBase = 0.000288 * sizeRatio;
    const radiusVar = 0.000144 * sizeRatio;
    // Scale velocity so brush dynamics feel similar regardless of char size
    const velMul = 40 / sizeRatio;

    // ---------- animation ----------
    let idx = 0;
    let ptIdx = -1; // track which point index we last splatted
    let sStart = performance.now() + INITIAL_DELAY;
    let lastTime = performance.now();
    let pausing = false;
    let pauseEnd = 0;

    function tick(now: number) {
      if (!running) return;
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;

      if (pausing) {
        if (now >= pauseEnd) {
          pausing = false;
          sStart = now;
        }
      } else if (idx < anims.length && now >= sStart) {
        const a = anims[idx];
        const elapsed = now - sStart;
        const progress = Math.min(elapsed / a.dur, 1);

        const targetIdx = Math.min(
          Math.floor(progress * (a.pts.length - 1)),
          a.pts.length - 1,
        );

        // Splat at EVERY point between last splatted and current target.
        // This prevents dots when frames skip ahead.
        for (let i = ptIdx + 1; i <= targetIdx; i++) {
          const pt = a.pts[i];
          const pp = i > 0 ? a.pts[i - 1] : null;
          if (pp) {
            const rdx = pt[0] - pp[0];
            const rdy = pt[1] - pp[1];
            const spd = Math.sqrt(rdx * rdx + rdy * rdy);
            const ink = Math.max(0.3, 0.8 - spd * 8);
            const r = radiusBase + radiusVar * (1 - Math.min(spd * 10, 0.8));
            sim.splat(pt[0], pt[1], rdx * velMul, rdy * velMul, ink, r);
          }
        }
        ptIdx = targetIdx;

        if (progress >= 1) {
          const pause = anims[idx].pause;
          idx++;
          ptIdx = -1;
          if (pause > 0) {
            pausing = true;
            pauseEnd = now + pause;
          } else {
            sStart = now;
          }
        }
      }

      sim.step(dt);
      sim.render();
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);

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
