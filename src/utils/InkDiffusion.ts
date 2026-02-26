// Ink diffusion simulation using Three.js TSL (Three.js Shading Language)
// Pure diffusion model — no velocity field, no waves
// Simulates 水墨のにじみ (ink bleeding in water) via heat equation

import {
  WebGPURenderer,
  QuadMesh,
  NodeMaterial,
  RenderTarget,
  HalfFloatType,
  LinearFilter,
  ClampToEdgeWrapping,
  CanvasTexture,
  NearestFilter,
} from "three/webgpu";

import {
  Fn,
  texture,
  uv,
  uniform,
  vec2,
  vec4,
  float,
  smoothstep,
  dot,
  vec3,
} from "three/tsl";

interface DblRT {
  read: RenderTarget;
  write: RenderTarget;
}

export class InkDiffusion {
  private renderer!: WebGPURenderer;
  private ink!: DblRT;
  private quad!: QuadMesh;
  private sw: number;
  private sh: number;
  private ready = false;

  // Uniforms
  private texelU = uniform(vec2(0, 0));
  private diffRateU = uniform(0.2);
  private fadeU = uniform(1.0);
  private strengthU = uniform(1.0);

  // Materials
  private diffuseMat!: NodeMaterial;
  private displayMat!: NodeMaterial;
  private loadInkMat!: NodeMaterial;
  private clearMat!: NodeMaterial;

  // Mutable texture references for ping-pong
  private inkTexNode!: ReturnType<typeof texture>;
  private sourceTexNode!: ReturnType<typeof texture>;

  private constructor(
    private canvas: HTMLCanvasElement,
    simRes: number,
    private alpha: boolean | "dark"
  ) {
    const aspect = canvas.width / canvas.height;
    this.sw = aspect > 1 ? simRes : Math.round(simRes * aspect);
    this.sh = aspect > 1 ? Math.round(simRes / aspect) : simRes;
  }

  static async create(
    canvas: HTMLCanvasElement,
    simRes = 384,
    alpha: boolean | "dark" = "dark"
  ): Promise<InkDiffusion> {
    const instance = new InkDiffusion(canvas, simRes, alpha);
    await instance.init();
    return instance;
  }

  private async init() {
    const useAlpha = !!this.alpha;
    this.renderer = new WebGPURenderer({
      canvas: this.canvas,
      alpha: useAlpha,
      forceWebGL: true,
    });
    await this.renderer.init();
    this.renderer.setSize(this.canvas.width, this.canvas.height, false);
    this.renderer.setClearColor(0x000000, 0); // transparent clear

    // Create ping-pong render targets
    const rtOpts = {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
    };
    this.ink = {
      read: new RenderTarget(this.sw, this.sh, rtOpts),
      write: new RenderTarget(this.sw, this.sh, rtOpts),
    };

    this.texelU.value.set(1 / this.sw, 1 / this.sh);

    this.buildMaterials();
    this.quad = new QuadMesh();
    this.ready = true;
  }

  private buildMaterials() {
    // Texture nodes — .value will be swapped for ping-pong
    this.inkTexNode = texture(this.ink.read.texture);
    this.sourceTexNode = texture(this.ink.read.texture); // placeholder

    const inkTex = this.inkTexNode;
    const texel = this.texelU;
    const diffRate = this.diffRateU;
    const fadeFactor = this.fadeU;

    // ── Diffusion + Fade pass ──
    // Heat equation: u' = u + D * laplacian(u), then multiply by fade
    this.diffuseMat = new NodeMaterial();
    this.diffuseMat.fragmentNode = Fn(() => {
      const center = texture(inkTex, uv());

      // 9-point stencil for smoother isotropic diffusion
      const l = texture(inkTex, uv().add(vec2(texel.x.negate(), float(0))));
      const r = texture(inkTex, uv().add(vec2(texel.x, float(0))));
      const u_ = texture(inkTex, uv().add(vec2(float(0), texel.y)));
      const d = texture(inkTex, uv().add(vec2(float(0), texel.y.negate())));

      // Diagonal neighbors
      const tl = texture(inkTex, uv().add(vec2(texel.x.negate(), texel.y)));
      const tr = texture(inkTex, uv().add(vec2(texel.x, texel.y)));
      const bl = texture(inkTex, uv().add(vec2(texel.x.negate(), texel.y.negate())));
      const br = texture(inkTex, uv().add(vec2(texel.x, texel.y.negate())));

      // Weighted laplacian (cross neighbors: weight 1, diagonals: weight 0.5)
      // laplacian = sum(neighbors) - 6 * center (for 9-point stencil normalization)
      const crossSum = l.add(r).add(u_).add(d);
      const diagSum = tl.add(tr).add(bl).add(br).mul(0.5);
      const laplacian = crossSum.add(diagSum).sub(center.mul(6.0));

      const diffused = center.add(laplacian.mul(diffRate));

      return diffused.mul(fadeFactor);
    })();

    // ── Display pass ──
    // Dark ink on transparent background
    this.displayMat = new NodeMaterial();
    this.displayMat.fragmentNode = Fn(() => {
      const raw = texture(inkTex, uv()).x;
      const ink = smoothstep(float(0.01), float(0.10), raw).mul(0.92);
      return vec4(float(0), float(0), float(0), ink);
    })();

    // ── Load ink from source canvas ──
    const sourceTex = this.sourceTexNode;
    const strength = this.strengthU;

    this.loadInkMat = new NodeMaterial();
    this.loadInkMat.fragmentNode = Fn(() => {
      // Flip Y: 2D canvas top-down vs WebGL bottom-up
      const flippedUv = vec2(uv().x, float(1.0).sub(uv().y));
      const src = texture(sourceTex, flippedUv);
      const lum = dot(src.xyz, vec3(0.299, 0.587, 0.114));
      const darkness = float(1.0).sub(lum).mul(src.w);
      const existing = texture(inkTex, uv()).x;
      return vec4(existing.add(darkness.mul(strength)), float(0), float(0), float(1));
    })();

    // ── Clear pass ──
    this.clearMat = new NodeMaterial();
    this.clearMat.fragmentNode = Fn(() => {
      return vec4(0, 0, 0, 1);
    })();
  }

  private swap(dbl: DblRT) {
    [dbl.read, dbl.write] = [dbl.write, dbl.read];
  }

  private pass(mat: NodeMaterial, target: RenderTarget) {
    this.inkTexNode.value = this.ink.read.texture;
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  // ── Public API (matches FluidSimulation where possible) ──

  /** Run diffusion steps. Higher rate = faster spread. */
  step(diffusionRate = 0.15, iterations = 3) {
    if (!this.ready) return;
    this.diffRateU.value = diffusionRate;
    this.fadeU.value = 1.0; // no fade during diffusion steps

    for (let i = 0; i < iterations; i++) {
      this.inkTexNode.value = this.ink.read.texture;
      this.pass(this.diffuseMat, this.ink.write);
      this.swap(this.ink);
    }
  }

  /** Multiply all ink density by factor (0 = clear, 1 = keep) */
  fadeInk(factor: number) {
    if (!this.ready) return;
    // Run one diffusion step with zero diffusion rate but with fade
    this.diffRateU.value = 0;
    this.fadeU.value = factor;
    this.inkTexNode.value = this.ink.read.texture;
    this.pass(this.diffuseMat, this.ink.write);
    this.swap(this.ink);
  }

  /** Render current ink state to the canvas */
  render() {
    if (!this.ready) return;
    this.inkTexNode.value = this.ink.read.texture;
    this.quad.material = this.displayMat;
    this.renderer.setRenderTarget(null);
    this.quad.render(this.renderer);
  }

  /** Load ink density from a 2D canvas (dark pixels → ink) */
  loadInkFromCanvas(sourceCanvas: HTMLCanvasElement, strength = 1.0) {
    if (!this.ready) return;
    const canvasTex = new CanvasTexture(sourceCanvas);
    canvasTex.minFilter = LinearFilter;
    canvasTex.magFilter = LinearFilter;
    canvasTex.needsUpdate = true;

    this.sourceTexNode.value = canvasTex;
    this.strengthU.value = strength;
    this.inkTexNode.value = this.ink.read.texture;
    this.pass(this.loadInkMat, this.ink.write);
    this.swap(this.ink);

    canvasTex.dispose();
  }

  /** Clear all ink */
  clear() {
    if (!this.ready) return;
    this.pass(this.clearMat, this.ink.read);
    this.pass(this.clearMat, this.ink.write);
  }

  resize(width: number, height: number) {
    if (!this.ready) return;
    this.renderer.setSize(width, height, false);
  }

  dispose() {
    this.ink?.read.dispose();
    this.ink?.write.dispose();
    this.diffuseMat?.dispose();
    this.displayMat?.dispose();
    this.loadInkMat?.dispose();
    this.clearMat?.dispose();
    this.renderer?.dispose();
  }
}
