import * as THREE from "three";
import type { ElementStrokes } from "./elementExtractor";
import type { CharacterStrokes, Stroke } from "./strokeGenerator";

interface StrokeMesh {
  mesh: THREE.Line;
  characterIndex: number;
  strokeIndex: number;
  totalLength: number;
  startTime: number;
  duration: number;
}

interface HandwritingRendererOptions {
  strokeWidth?: number;
  strokeSpeed?: number; // pixels per second
  delayBetweenChars?: number; // seconds
  delayBetweenStrokes?: number; // seconds
  backgroundColor?: string; // CSS color string
}

/**
 * Parse CSS color string to RGB values (0-1 range)
 */
function parseColor(colorString: string): THREE.Color {
  // Create a temporary element to parse the color
  const tempDiv = document.createElement("div");
  tempDiv.style.color = colorString;
  document.body.appendChild(tempDiv);
  const computedColor = window.getComputedStyle(tempDiv).color;
  document.body.removeChild(tempDiv);

  // Parse rgb(r, g, b) or rgba(r, g, b, a)
  const match = computedColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) {
    return new THREE.Color(
      parseInt(match[1]) / 255,
      parseInt(match[2]) / 255,
      parseInt(match[3]) / 255
    );
  }

  return new THREE.Color(0, 0, 0);
}

/**
 * Calculate the length of a stroke
 */
function calculateStrokeLength(points: { x: number; y: number }[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

interface FadeOutOptions {
  duration?: number;
  domDelay?: number;
  fadeOverlap?: number; // アニメーション完了の何秒前からフェードを開始するか
  onProgress?: (canvasOpacity: number, domOpacity: number) => void;
  onComplete?: () => void;
}

export class HandwritingRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private strokeMeshes: StrokeMesh[] = [];
  private options: Required<HandwritingRendererOptions>;
  private animationStartTime: number = 0;
  private isAnimating: boolean = false;
  private animationFrame: number | null = null;
  private backgroundColor: THREE.Color;

  // Fade out state
  private isFadingOut: boolean = false;
  private fadeStartTime: number = 0;
  private fadeDuration: number = 2.0;
  private fadeDomDelay: number = 0.1;
  private fadeOverlap: number = 0.5;
  private onFadeProgress?: (canvasOpacity: number, domOpacity: number) => void;
  private onFadeComplete?: () => void;
  private pendingFadeOptions?: FadeOutOptions;
  private onFadeStart?: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    options: HandwritingRendererOptions = {}
  ) {
    this.options = {
      strokeWidth: options.strokeWidth ?? 2,
      strokeSpeed: options.strokeSpeed ?? 500,
      delayBetweenChars: options.delayBetweenChars ?? 0.05,
      delayBetweenStrokes: options.delayBetweenStrokes ?? 0.01,
      backgroundColor: options.backgroundColor ?? "#f8f5f0",
    };

    this.backgroundColor = parseColor(this.options.backgroundColor);

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(this.backgroundColor, 1);

    // Setup scene
    this.scene = new THREE.Scene();
    this.scene.background = this.backgroundColor;

    // Setup orthographic camera (2D view)
    // OrthographicCamera(left, right, top, bottom, near, far)
    // Use top=0, bottom=height for DOM coordinate system (Y increases downward)
    // Flip Y scale to match DOM coordinates
    this.camera = new THREE.OrthographicCamera(0, width, 0, height, -1, 1);
    this.camera.position.z = 1;

    // Initial render to show background immediately
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Create line geometry from stroke points
   */
  private createStrokeMesh(stroke: Stroke): THREE.Line {
    // Use DOM coordinates directly (strokeGenerator already outputs DOM coordinates)
    const points = stroke.points.map((p) => new THREE.Vector3(p.x, p.y, 0));

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Add progress attribute for animation
    const progressArray = new Float32Array(points.length);
    const totalLength = calculateStrokeLength(stroke.points);
    let accumulatedLength = 0;

    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        const dx = stroke.points[i].x - stroke.points[i - 1].x;
        const dy = stroke.points[i].y - stroke.points[i - 1].y;
        accumulatedLength += Math.sqrt(dx * dx + dy * dy);
      }
      progressArray[i] = totalLength > 0 ? accumulatedLength / totalLength : 0;
    }

    geometry.setAttribute(
      "progress",
      new THREE.BufferAttribute(progressArray, 1)
    );

    const color = parseColor(stroke.color);

    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: this.options.strokeWidth,
      transparent: true,
      opacity: 1,
    });

    return new THREE.Line(geometry, material);
  }

  /**
   * Add character strokes to the scene
   */
  addCharacterStrokes(
    allStrokes: CharacterStrokes[],
    startTime: number = 0
  ): void {
    let currentTime = startTime;

    for (let charIndex = 0; charIndex < allStrokes.length; charIndex++) {
      const charStrokes = allStrokes[charIndex];

      for (
        let strokeIndex = 0;
        strokeIndex < charStrokes.strokes.length;
        strokeIndex++
      ) {
        const stroke = charStrokes.strokes[strokeIndex];

        if (stroke.points.length < 2) continue;

        const mesh = this.createStrokeMesh(stroke);
        const totalLength = calculateStrokeLength(stroke.points);
        const duration = totalLength / this.options.strokeSpeed;

        // Initially hide the stroke
        (mesh.material as THREE.LineBasicMaterial).opacity = 0;

        this.scene.add(mesh);

        this.strokeMeshes.push({
          mesh,
          characterIndex: charIndex,
          strokeIndex,
          totalLength,
          startTime: currentTime,
          duration,
        });

        currentTime += duration + this.options.delayBetweenStrokes;
      }

      currentTime += this.options.delayBetweenChars;
    }
  }

  /**
   * Add element strokes (borders, SVG, images) to the scene
   */
  addElementStrokes(allStrokes: ElementStrokes[], startTime: number = 0): void {
    let currentTime = startTime;

    for (let elemIndex = 0; elemIndex < allStrokes.length; elemIndex++) {
      const elemStrokes = allStrokes[elemIndex];

      for (
        let strokeIndex = 0;
        strokeIndex < elemStrokes.strokes.length;
        strokeIndex++
      ) {
        const stroke = elemStrokes.strokes[strokeIndex];

        if (stroke.points.length < 2) continue;

        const mesh = this.createStrokeMesh(stroke);
        const totalLength = calculateStrokeLength(stroke.points);
        const duration = totalLength / this.options.strokeSpeed;

        // Initially hide the stroke
        (mesh.material as THREE.LineBasicMaterial).opacity = 0;

        this.scene.add(mesh);

        this.strokeMeshes.push({
          mesh,
          characterIndex: -1 - elemIndex, // Use negative index for elements
          strokeIndex,
          totalLength,
          startTime: currentTime,
          duration,
        });

        currentTime += duration + this.options.delayBetweenStrokes;
      }

      currentTime += this.options.delayBetweenChars * 0.5; // Shorter delay between elements
    }
  }

  /**
   * Add raw strokes directly to the scene
   */
  addStrokes(strokes: Stroke[], startTime: number = 0): void {
    let currentTime = startTime;

    for (let strokeIndex = 0; strokeIndex < strokes.length; strokeIndex++) {
      const stroke = strokes[strokeIndex];

      if (stroke.points.length < 2) continue;

      const mesh = this.createStrokeMesh(stroke);
      const totalLength = calculateStrokeLength(stroke.points);
      const duration = totalLength / this.options.strokeSpeed;

      // Initially hide the stroke
      (mesh.material as THREE.LineBasicMaterial).opacity = 0;

      this.scene.add(mesh);

      this.strokeMeshes.push({
        mesh,
        characterIndex: -100, // Use special index for raw strokes
        strokeIndex,
        totalLength,
        startTime: currentTime,
        duration,
      });

      currentTime += duration + this.options.delayBetweenStrokes;
    }
  }

  /**
   * Start the drawing animation
   * @param onFadeStart - フェード開始時に呼ばれるコールバック（DOM準備用）
   * @param fadeOptions - フェードアウトのオプション
   */
  startAnimation(onFadeStart?: () => void, fadeOptions?: FadeOutOptions): void {
    this.onFadeStart = onFadeStart;
    this.pendingFadeOptions = fadeOptions;
    this.fadeOverlap = fadeOptions?.fadeOverlap ?? 0.5;
    this.animationStartTime = performance.now() / 1000;
    this.isAnimating = true;
    this.animate();
  }

  /**
   * Animation loop
   */
  private animate = (): void => {
    if (!this.isAnimating) return;

    const currentTime = performance.now() / 1000 - this.animationStartTime;
    const totalDuration = this.getTotalDuration();
    const remainingTime = totalDuration - currentTime;
    let allComplete = true;

    for (const strokeData of this.strokeMeshes) {
      const material = strokeData.mesh.material as THREE.LineBasicMaterial;

      if (currentTime < strokeData.startTime) {
        // Not started yet
        material.opacity = 0;
        allComplete = false;
      } else if (currentTime < strokeData.startTime + strokeData.duration) {
        // Currently drawing
        const progress =
          (currentTime - strokeData.startTime) / strokeData.duration;

        // Update geometry to show only the drawn part
        this.updateStrokeProgress(strokeData.mesh, progress);
        material.opacity = 1;
        allComplete = false;
      } else {
        // Complete
        this.updateStrokeProgress(strokeData.mesh, 1);
        material.opacity = 1;
      }
    }

    this.renderer.render(this.scene, this.camera);

    // アニメーション完了の fadeOverlap 秒前からフェードを開始
    if (
      remainingTime <= this.fadeOverlap &&
      !this.isFadingOut &&
      this.pendingFadeOptions
    ) {
      // フェード開始時のコールバック（DOM準備用）
      this.onFadeStart?.();
      this.startFadeOut(this.pendingFadeOptions);
    }

    if (allComplete) {
      this.isAnimating = false;
      // フェードがまだ開始されていなければ開始
      if (!this.isFadingOut && this.pendingFadeOptions) {
        this.onFadeStart?.();
        this.startFadeOut(this.pendingFadeOptions);
      }
    } else {
      this.animationFrame = requestAnimationFrame(this.animate);
    }
  };

  /**
   * Update stroke to show only the portion that has been drawn
   */
  private updateStrokeProgress(mesh: THREE.Line, progress: number): void {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const progressAttr = geometry.getAttribute("progress");

    if (!progressAttr) return;

    // Find the index up to which we should draw
    let drawCount = 0;
    for (let i = 0; i < progressAttr.count; i++) {
      if (progressAttr.getX(i) <= progress) {
        drawCount = i + 1;
      }
    }

    geometry.setDrawRange(0, Math.max(drawCount, 2));
  }

  /**
   * Handle window resize
   */
  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer.setSize(width, height);
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Get total animation duration
   */
  getTotalDuration(): number {
    if (this.strokeMeshes.length === 0) return 0;

    const lastStroke = this.strokeMeshes[this.strokeMeshes.length - 1];
    return lastStroke.startTime + lastStroke.duration;
  }

  /**
   * Start fade out transition with synchronized DOM opacity control
   */
  startFadeOut(options: FadeOutOptions = {}): void {
    this.fadeDuration = options.duration ?? 2.0;
    this.fadeDomDelay = options.domDelay ?? 0.1;
    this.onFadeProgress = options.onProgress;
    this.onFadeComplete = options.onComplete;

    this.isFadingOut = true;
    this.fadeStartTime = performance.now() / 1000;
    this.animateFadeOut();
  }

  /**
   * Easing function for smooth fade
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Fade out animation loop
   */
  private animateFadeOut = (): void => {
    if (!this.isFadingOut) return;

    const currentTime = performance.now() / 1000;
    const elapsed = currentTime - this.fadeStartTime;
    const progress = Math.min(elapsed / this.fadeDuration, 1);

    // Canvas opacity: starts immediately, eases out
    const canvasOpacity = 1 - this.easeInOutCubic(progress);

    // DOM opacity: starts after delay, catches up
    const domStartProgress = this.fadeDomDelay / this.fadeDuration;
    let domOpacity = 0;
    if (progress > domStartProgress) {
      const domProgress =
        (progress - domStartProgress) / (1 - domStartProgress);
      domOpacity = this.easeInOutCubic(Math.min(domProgress, 1));
    }

    this.renderer.render(this.scene, this.camera);

    // Notify progress
    this.onFadeProgress?.(canvasOpacity, domOpacity);

    if (progress >= 1) {
      this.isFadingOut = false;
      this.onFadeComplete?.();
    } else {
      this.animationFrame = requestAnimationFrame(this.animateFadeOut);
    }
  };

  /**
   * Clean up resources
   */
  dispose(): void {
    this.isAnimating = false;
    this.isFadingOut = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    for (const strokeData of this.strokeMeshes) {
      strokeData.mesh.geometry.dispose();
      (strokeData.mesh.material as THREE.Material).dispose();
      this.scene.remove(strokeData.mesh);
    }

    this.strokeMeshes = [];
    this.renderer.dispose();
  }
}
