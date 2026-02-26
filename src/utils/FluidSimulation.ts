// Navier-Stokes fluid simulation on WebGL2
// Used for sumi ink calligraphy effect

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 vUv;
void main() {
  vUv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0, 1);
}`;

const ADVECT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_vel;
uniform sampler2D u_src;
uniform vec2 u_texel;
uniform float u_dt;
uniform float u_diss;
void main() {
  vec2 coord = vUv - u_dt * texture(u_vel, vUv).xy * u_texel;
  o = u_diss * texture(u_src, coord);
}`;

const DIV_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_vel;
uniform vec2 u_texel;
void main() {
  float R = texture(u_vel, vUv + vec2(u_texel.x, 0)).x;
  float L = texture(u_vel, vUv - vec2(u_texel.x, 0)).x;
  float T = texture(u_vel, vUv + vec2(0, u_texel.y)).y;
  float B = texture(u_vel, vUv - vec2(0, u_texel.y)).y;
  o = vec4(0.5 * (R - L + T - B), 0, 0, 1);
}`;

const PRESSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_pres;
uniform sampler2D u_div;
uniform vec2 u_texel;
void main() {
  float R = texture(u_pres, vUv + vec2(u_texel.x, 0)).x;
  float L = texture(u_pres, vUv - vec2(u_texel.x, 0)).x;
  float T = texture(u_pres, vUv + vec2(0, u_texel.y)).x;
  float B = texture(u_pres, vUv - vec2(0, u_texel.y)).x;
  float d = texture(u_div, vUv).x;
  o = vec4((L + R + B + T - d) * 0.25, 0, 0, 1);
}`;

const GRAD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_pres;
uniform sampler2D u_vel;
uniform vec2 u_texel;
void main() {
  float R = texture(u_pres, vUv + vec2(u_texel.x, 0)).x;
  float L = texture(u_pres, vUv - vec2(u_texel.x, 0)).x;
  float T = texture(u_pres, vUv + vec2(0, u_texel.y)).x;
  float B = texture(u_pres, vUv - vec2(0, u_texel.y)).x;
  vec2 v = texture(u_vel, vUv).xy - vec2(R - L, T - B) * 0.5;
  o = vec4(v, 0, 1);
}`;

const SPLAT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_target;
uniform vec2 u_point;
uniform float u_aspect;
uniform vec3 u_val;
uniform float u_radius;
void main() {
  vec2 d = vUv - u_point;
  d.x *= u_aspect;
  float s = exp(-dot(d, d) / u_radius);
  o = vec4(texture(u_target, vUv).xyz + s * u_val, 1);
}`;

// No Y-flip: hanzi-writer Y-up matches WebGL UV Y-up
const DISPLAY_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_ink;
void main() {
  float raw = texture(u_ink, vUv).x;
  // Sharp ink: cut off faint tails, narrow transition for crisp strokes
  float ink = smoothstep(0.08, 0.18, raw) * 0.93;
  o = vec4(vec3(1.0 - ink), 1);
}`;

// White ink with alpha, used with CSS mix-blend-mode: difference
// difference(white, white_bg) = black → visible ink on background
// difference(white, black_text) = white → text turns white under ink
const DISPLAY_ALPHA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_ink;
void main() {
  float raw = texture(u_ink, vUv).x;
  float ink = smoothstep(0.008, 0.12, raw) * 0.95;
  o = vec4(ink, ink, ink, ink);
}`;

// Dark ink with alpha transparency – for transition overlay
// Black ink appears on transparent canvas, spreading via fluid dynamics
const DISPLAY_DARK_ALPHA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_ink;
void main() {
  float raw = texture(u_ink, vUv).x;
  float ink = smoothstep(0.01, 0.10, raw) * 0.92;
  o = vec4(0.0, 0.0, 0.0, ink);
}`;

// Load ink from a 2D canvas – converts dark pixels to ink density
const LOAD_INK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_source;
uniform sampler2D u_existing;
uniform float u_strength;
void main() {
  vec2 flippedUv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 src = texture(u_source, flippedUv);
  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  float darkness = (1.0 - lum) * src.a;
  float existing = texture(u_existing, vUv).x;
  o = vec4(existing + darkness * u_strength, 0.0, 0.0, 1.0);
}`;

const SCALE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D u_target;
uniform float u_scale;
void main() {
  o = u_scale * texture(u_target, vUv);
}`;

interface FBO {
  tex: WebGLTexture;
  fb: WebGLFramebuffer;
}

interface DblFBO {
  read: FBO;
  write: FBO;
}

export class FluidSimulation {
  private gl: WebGL2RenderingContext;
  private sw: number;
  private sh: number;
  private dw: number;
  private dh: number;

  private progs: Record<string, WebGLProgram> = {};
  private vel: DblFBO;
  private pres: DblFBO;
  private div: FBO;
  private ink: DblFBO;

  constructor(canvas: HTMLCanvasElement, simRes = 128, alpha: boolean | "dark" = false) {
    const useAlpha = !!alpha;
    const gl = canvas.getContext("webgl2", { alpha: useAlpha, premultipliedAlpha: true })!;
    if (!gl) throw new Error("WebGL2 required");
    this.gl = gl;

    const floatExt = gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    if (!floatExt) {
      console.warn("EXT_color_buffer_float not available");
    }

    this.dw = canvas.width;
    this.dh = canvas.height;
    const a = canvas.width / canvas.height;
    this.sw = a > 1 ? simRes : Math.round(simRes * a);
    this.sh = a > 1 ? Math.round(simRes / a) : simRes;

    // Compile all programs
    const shaders: Record<string, string> = {
      advect: ADVECT_FRAG,
      div: DIV_FRAG,
      pressure: PRESSURE_FRAG,
      grad: GRAD_FRAG,
      splat: SPLAT_FRAG,
      display: alpha === "dark" ? DISPLAY_DARK_ALPHA_FRAG : alpha ? DISPLAY_ALPHA_FRAG : DISPLAY_FRAG,
      scale: SCALE_FRAG,
      loadInk: LOAD_INK_FRAG,
    };
    for (const [name, fs] of Object.entries(shaders)) {
      this.progs[name] = this.compile(VERT, fs);
    }

    // Full-screen triangle VAO
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Use RGBA16F for maximum compatibility
    const { sw, sh } = this;
    const LIN = gl.LINEAR;
    const NR = gl.NEAREST;
    const F = gl.RGBA16F;
    const RGBA = gl.RGBA;
    const HF = gl.HALF_FLOAT;
    this.vel = this.dblFBO(sw, sh, F, RGBA, HF, LIN);
    this.pres = this.dblFBO(sw, sh, F, RGBA, HF, NR);
    this.div = this.fbo(sw, sh, F, RGBA, HF, NR);
    this.ink = this.dblFBO(sw, sh, F, RGBA, HF, LIN);

    // Verify framebuffer completeness
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ink.read.fb);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error("Framebuffer not complete:", status);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private compile(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(s));
      }
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(p));
    }
    return p;
  }

  private fbo(
    w: number,
    h: number,
    ifmt: number,
    fmt: number,
    type: number,
    filter: number
  ): FBO {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      tex,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb };
  }

  private dblFBO(
    w: number,
    h: number,
    ifmt: number,
    fmt: number,
    type: number,
    filter: number
  ): DblFBO {
    return {
      read: this.fbo(w, h, ifmt, fmt, type, filter),
      write: this.fbo(w, h, ifmt, fmt, type, filter),
    };
  }

  private swap(d: DblFBO) {
    [d.read, d.write] = [d.write, d.read];
  }

  private bind(fbo: FBO | null, w?: number, h?: number) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo ? fbo.fb : null);
    gl.viewport(0, 0, w ?? this.dw, h ?? this.dh);
  }

  private uni(p: WebGLProgram, n: string, ...v: number[]) {
    const loc = this.gl.getUniformLocation(p, n);
    if (!loc) return;
    if (v.length === 1) this.gl.uniform1f(loc, v[0]);
    else if (v.length === 2) this.gl.uniform2f(loc, v[0], v[1]);
    else if (v.length === 3) this.gl.uniform3f(loc, v[0], v[1], v[2]);
  }

  private tex(p: WebGLProgram, n: string, t: WebGLTexture, unit: number) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, t);
    this.gl.uniform1i(this.gl.getUniformLocation(p, n), unit);
  }

  private run(p: WebGLProgram, target: FBO | null, w?: number, h?: number) {
    this.gl.useProgram(p);
    this.bind(target, w, h);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  splat(
    x: number,
    y: number,
    dx: number,
    dy: number,
    inkAmt: number,
    radius: number
  ) {
    const gl = this.gl;
    const p = this.progs.splat;
    const aspect = this.sw / this.sh;
    gl.useProgram(p);

    // Velocity splat
    this.tex(p, "u_target", this.vel.read.tex, 0);
    this.uni(p, "u_point", x, y);
    this.uni(p, "u_aspect", aspect);
    this.uni(p, "u_val", dx, dy, 0);
    this.uni(p, "u_radius", radius);
    this.bind(this.vel.write, this.sw, this.sh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.swap(this.vel);

    // Ink splat
    this.tex(p, "u_target", this.ink.read.tex, 0);
    this.uni(p, "u_val", inkAmt, 0, 0);
    this.bind(this.ink.write, this.sw, this.sh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.swap(this.ink);
  }

  step(dt: number) {
    const { sw, sh } = this;
    const tx = [1 / sw, 1 / sh] as const;

    // Advect velocity
    const a = this.progs.advect;
    this.gl.useProgram(a);
    this.tex(a, "u_vel", this.vel.read.tex, 0);
    this.tex(a, "u_src", this.vel.read.tex, 1);
    this.uni(a, "u_texel", ...tx);
    this.uni(a, "u_dt", dt);
    this.uni(a, "u_diss", 0.98);
    this.run(a, this.vel.write, sw, sh);
    this.swap(this.vel);

    // Divergence
    const d = this.progs.div;
    this.gl.useProgram(d);
    this.tex(d, "u_vel", this.vel.read.tex, 0);
    this.uni(d, "u_texel", ...tx);
    this.run(d, this.div, sw, sh);

    // Clear pressure
    const sc = this.progs.scale;
    this.gl.useProgram(sc);
    this.tex(sc, "u_target", this.pres.read.tex, 0);
    this.uni(sc, "u_scale", 0.8);
    this.run(sc, this.pres.write, sw, sh);
    this.swap(this.pres);

    // Pressure solve (20 Jacobi iterations)
    const pr = this.progs.pressure;
    this.gl.useProgram(pr);
    this.uni(pr, "u_texel", ...tx);
    for (let i = 0; i < 20; i++) {
      this.tex(pr, "u_pres", this.pres.read.tex, 0);
      this.tex(pr, "u_div", this.div.tex, 1);
      this.run(pr, this.pres.write, sw, sh);
      this.swap(this.pres);
    }

    // Gradient subtraction
    const g = this.progs.grad;
    this.gl.useProgram(g);
    this.tex(g, "u_pres", this.pres.read.tex, 0);
    this.tex(g, "u_vel", this.vel.read.tex, 1);
    this.uni(g, "u_texel", ...tx);
    this.run(g, this.vel.write, sw, sh);
    this.swap(this.vel);

    // Advect ink
    this.gl.useProgram(a);
    this.tex(a, "u_vel", this.vel.read.tex, 0);
    this.tex(a, "u_src", this.ink.read.tex, 1);
    this.uni(a, "u_texel", ...tx);
    this.uni(a, "u_dt", dt);
    this.uni(a, "u_diss", 0.999);
    this.run(a, this.ink.write, sw, sh);
    this.swap(this.ink);
  }

  render() {
    const p = this.progs.display;
    this.gl.useProgram(p);
    this.tex(p, "u_ink", this.ink.read.tex, 0);
    this.bind(null);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  fadeInk(factor: number) {
    const p = this.progs.scale;
    this.gl.useProgram(p);
    this.tex(p, "u_target", this.ink.read.tex, 0);
    this.uni(p, "u_scale", factor);
    this.run(p, this.ink.write, this.sw, this.sh);
    this.swap(this.ink);
  }

  clear() {
    const p = this.progs.scale;
    this.gl.useProgram(p);
    this.uni(p, "u_scale", 0);

    this.tex(p, "u_target", this.ink.read.tex, 0);
    this.run(p, this.ink.write, this.sw, this.sh);
    this.swap(this.ink);

    this.tex(p, "u_target", this.vel.read.tex, 0);
    this.run(p, this.vel.write, this.sw, this.sh);
    this.swap(this.vel);
  }

  loadInkFromCanvas(sourceCanvas: HTMLCanvasElement, strength = 1.0) {
    const gl = this.gl;

    const srcTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    const p = this.progs.loadInk;
    gl.useProgram(p);
    this.tex(p, "u_source", srcTex, 2);
    this.tex(p, "u_existing", this.ink.read.tex, 0);
    this.uni(p, "u_strength", strength);
    this.bind(this.ink.write, this.sw, this.sh);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.swap(this.ink);

    gl.deleteTexture(srcTex);
  }

  resize(width: number, height: number) {
    this.dw = width;
    this.dh = height;
  }

  /** Export current ink as a dark-on-transparent 2D canvas.
   *  Reads directly from the simulation FBO (always valid, no preserveDrawingBuffer needed). */
  exportInkCanvas(): HTMLCanvasElement | null {
    const gl = this.gl;
    const { sw, sh } = this;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ink.read.fb);
    const pixels = new Float32Array(sw * sh * 4);
    gl.readPixels(0, 0, sw, sh, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext("2d")!;
    const imageData = ctx.createImageData(sw, sh);
    const d = imageData.data;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        // Flip Y: WebGL bottom-up → Canvas top-down
        const si = ((sh - 1 - y) * sw + x) * 4;
        const di = (y * sw + x) * 4;
        const raw = pixels[si]; // ink density in R channel
        // Match DISPLAY_FRAG: smoothstep(0.08, 0.18, raw) * 0.93
        const t = Math.max(0, Math.min(1, (raw - 0.08) / 0.10));
        const ink = t * t * (3 - 2 * t) * 0.93;
        d[di] = 0;
        d[di + 1] = 0;
        d[di + 2] = 0;
        d[di + 3] = Math.round(ink * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return out;
  }

  dispose() {
    const gl = this.gl;
    Object.values(this.progs).forEach((p) => gl.deleteProgram(p));
    const del = (f: FBO) => {
      gl.deleteTexture(f.tex);
      gl.deleteFramebuffer(f.fb);
    };
    [this.vel, this.pres, this.ink].forEach((d) => {
      del(d.read);
      del(d.write);
    });
    del(this.div);
  }
}
