import { applyChromaKeyToImageData, resolveChromaKey, type ChromaKeyConfig } from './chromaKey';

/**
 * Real-time chroma key for the timeline preview.
 *
 * A fragment shader keys each frame on the GPU (same maths as chromaKey.ts) and the result is drawn into the
 * preview canvas like any other source. If WebGL is not available the same maths runs on the CPU at a reduced size.
 *
 * One shared canvas is reused for every keyed clip, so a caller must draw the returned canvas before keying again.
 */

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, aPos.y * 0.5 + 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Mirrors keyAlpha() and despillPixel() in chromaKey.ts.
const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uKeyCbCr;
uniform float uSimilarity;
uniform float uBlend;
uniform float uDespill;
uniform float uSpillChannel;

vec2 cbcr(vec3 c) {
  return vec2(
    -0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b,
     0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b
  );
}

void main() {
  vec4 src = texture2D(uTex, vUv);
  vec3 c = src.rgb;
  float diff = length(cbcr(c) - uKeyCbCr) / 1.41421356;
  float alpha = uBlend > 0.0001 ? clamp((diff - uSimilarity) / uBlend, 0.0, 1.0) : (diff > uSimilarity ? 1.0 : 0.0);

  float key = uSpillChannel < 0.5 ? c.r : (uSpillChannel < 1.5 ? c.g : c.b);
  float other = uSpillChannel < 0.5 ? max(c.g, c.b) : (uSpillChannel < 1.5 ? max(c.r, c.b) : max(c.r, c.g));
  float cleaned = key - max(0.0, key - other) * uDespill;
  if (uSpillChannel < 0.5) c.r = cleaned; else if (uSpillChannel < 1.5) c.g = cleaned; else c.b = cleaned;

  float outAlpha = src.a * alpha;
  gl_FragColor = vec4(c * outAlpha, outAlpha);
}`;

const MAX_WIDTH = 1920;
const CPU_MAX_WIDTH = 960;

type KeySource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

const sourceSize = (source: KeySource): { width: number; height: number } => {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  return { width: source.width, height: source.height };
};

const compile = (gl: WebGLRenderingContext, type: number, code: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, code);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Chroma key shader failed to compile', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

class GpuKeyer {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly uniforms: Record<string, WebGLUniformLocation | null>;
  private readonly texture: WebGLTexture;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, program: WebGLProgram, texture: WebGLTexture) {
    this.canvas = canvas;
    this.gl = gl;
    this.texture = texture;
    this.uniforms = {
      uTex: gl.getUniformLocation(program, 'uTex'),
      uKeyCbCr: gl.getUniformLocation(program, 'uKeyCbCr'),
      uSimilarity: gl.getUniformLocation(program, 'uSimilarity'),
      uBlend: gl.getUniformLocation(program, 'uBlend'),
      uDespill: gl.getUniformLocation(program, 'uDespill'),
      uSpillChannel: gl.getUniformLocation(program, 'uSpillChannel'),
    };
  }

  static create(): GpuKeyer | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false })
      || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) return null;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    return new GpuKeyer(canvas, gl, program, texture);
  }

  render(source: KeySource, width: number, height: number, config: ChromaKeyConfig): HTMLCanvasElement | null {
    const { gl, canvas } = this;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (error) {
      // Cross-origin media without CORS headers cannot be uploaded; the caller falls back to the unkeyed frame.
      console.warn('Chroma key skipped (frame could not be read)', error);
      return null;
    }
    const key = resolveChromaKey(config);
    gl.uniform1i(this.uniforms.uTex, 0);
    gl.uniform2f(this.uniforms.uKeyCbCr, key.keyCb, key.keyCr);
    gl.uniform1f(this.uniforms.uSimilarity, key.similarity);
    gl.uniform1f(this.uniforms.uBlend, key.blend);
    gl.uniform1f(this.uniforms.uDespill, key.despill);
    gl.uniform1f(this.uniforms.uSpillChannel, key.spillChannel);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return canvas;
  }
}

let gpuKeyer: GpuKeyer | null | undefined;
let cpuCanvas: HTMLCanvasElement | null = null;

const keyOnCpu = (source: KeySource, width: number, height: number, config: ChromaKeyConfig): HTMLCanvasElement | null => {
  if (!cpuCanvas) cpuCanvas = document.createElement('canvas');
  const scale = Math.min(1, CPU_MAX_WIDTH / width);
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));
  if (cpuCanvas.width !== w || cpuCanvas.height !== h) {
    cpuCanvas.width = w;
    cpuCanvas.height = h;
  }
  const ctx = cpuCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  try {
    const image = ctx.getImageData(0, 0, w, h);
    applyChromaKeyToImageData(image.data, config);
    ctx.putImageData(image, 0, 0);
  } catch (error) {
    console.warn('Chroma key skipped (frame could not be read)', error);
    return null;
  }
  return cpuCanvas;
};

/**
 * Key one frame. Returns a canvas with the screen colour made transparent, or null when keying is not possible
 * (the caller should then draw the original frame). The canvas is shared: draw it before calling again.
 */
export const keyFrame = (source: KeySource, config: ChromaKeyConfig): HTMLCanvasElement | null => {
  const size = sourceSize(source);
  if (!size.width || !size.height) return null;
  const scale = Math.min(1, MAX_WIDTH / size.width);
  const width = Math.max(2, Math.round(size.width * scale));
  const height = Math.max(2, Math.round(size.height * scale));

  if (gpuKeyer === undefined) gpuKeyer = GpuKeyer.create();
  if (gpuKeyer) {
    const keyed = gpuKeyer.render(source, width, height, config);
    if (keyed) return keyed;
    return null;
  }
  return keyOnCpu(source, width, height, config);
};

/** Test hook: forget the shared GPU context. */
export const resetChromaKeyGL = (): void => {
  gpuKeyer = undefined;
  cpuCanvas = null;
};
