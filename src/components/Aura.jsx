import { useEffect, useRef } from "react";

/* ------------------------------------------------------------
   Aura — the quiet living light behind the words and paintings:
   a slow warm haze, soft rippling lines of light and rising embers.
   Deliberately nothing with a hard edge.


   It reads live values from `signals` (a plain mutable object
   owned by the reader engine) so React never re-renders it.
   ------------------------------------------------------------ */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2  uRes;
uniform float uTime;
uniform float uScroll;   // 0..1 progress through the paath
uniform vec2  uPointer;  // -1..1
uniform float uEnergy;   // 0..1, bumps on every word

const vec3 NIGHT   = vec3(0.030, 0.017, 0.010);
const vec3 UMBER   = vec3(0.200, 0.075, 0.022);
const vec3 SINDOOR = vec3(0.720, 0.215, 0.045);
const vec3 GOLD    = vec3(1.000, 0.740, 0.330);

// smoothstep that is safe with edges in either order
float sst(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float embers(vec2 uv, float t, float scale, float seed) {
  vec2 g = uv * scale;
  g.y -= t * (0.55 + seed * 0.35);
  g.x += sin(t * 0.6 + g.y * 0.7 + seed * 6.0) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id + seed * 17.0);
  if (h < 0.86) return 0.0;
  vec2 o = (vec2(hash(id + 1.3), hash(id + 7.7)) - 0.5) * 0.7;
  float tw = 0.45 + 0.55 * sin(t * 2.5 + h * 40.0);
  return sst(0.07, 0.0, length(f - o)) * tw;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * 0.05;

  // A slow warm haze made only of sine waves: perfectly smooth on every
  // screen, with no creases, blocks or straight edges anywhere.
  vec2 p = uv + uPointer * 0.05;
  float a = sin(p.x * 1.7 + t * 1.3 + sin(p.y * 1.3 - t) * 1.2);
  float b = sin(p.y * 2.1 - t * 1.1 + sin(p.x * 1.9 + t * 0.7) * 1.4 + uScroll * 4.0);
  float f = 0.5 + 0.25 * (a + b);

  // an even, quiet tone: it drifts a little but never gathers into a bright patch
  vec3 col = mix(NIGHT, UMBER, 0.34 + 0.22 * f);

  // soft flowing lines of light, like slow ripples
  float lines = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = -0.16 - fi * 0.1
            + 0.07 * sin(uv.x * (2.0 + fi * 0.45) + uTime * (0.22 + fi * 0.05) + fi * 1.7)
            + 0.03 * sin(uv.x * 4.6 - uTime * 0.17 + fi * 2.3);
    float d = abs(uv.y - y);
    lines += (0.006 / (d + 0.006)) * (0.055 - fi * 0.008);
  }
  col += GOLD * lines * (0.5 + 0.25 * uEnergy);

  // embers at three depths (near = big & bright, far = fine & faint)
  float e = embers(uv, uTime * 0.16, 5.0, 0.11) * 1.0
          + embers(uv + 3.1, uTime * 0.12, 9.0, 0.47) * 0.6
          + embers(uv + 7.7, uTime * 0.09, 15.0, 0.83) * 0.35;
  col += vec3(1.0, 0.62, 0.22) * e * (0.55 + 0.6 * uEnergy);

  // vignette + fine grain so gradients never band
  float v = sst(1.25, 0.25, length(uv * vec2(0.85, 1.0)));
  col *= mix(0.82, 1.0, v);
  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.014;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn("Aura shader:", gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

export default function Aura({ signals, overArt }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // CSS gradient on <body> remains as the fallback

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ["uRes", "uTime", "uScroll", "uPointer", "uEnergy"]) U[n] = gl.getUniformLocation(prog, n);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 760px)");

    const resize = () => {
      // The stage is soft, so it renders below native resolution — cheap on phones.
      const scale = Math.min(window.devicePixelRatio || 1, 1.5) * (small.matches ? 0.55 : 0.7);
      const w = Math.max(2, Math.round(canvas.clientWidth * scale));
      const h = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let px = 0;
    let py = 0;
    let energy = 0;
    const t0 = performance.now();
    canvas.classList.add("is-live");

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const still = reduce.matches;

      px += (signals.pointerX - px) * 0.04;
      py += (signals.pointerY - py) * 0.04;
      energy += (signals.energy - energy) * 0.12;
      signals.energy *= 0.94; // each word's pulse fades on its own
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, still ? 12.0 : (now - t0) / 1000);
      gl.uniform1f(U.uScroll, signals.progress);
      gl.uniform2f(U.uPointer, still ? 0 : px, still ? 0 : -py);
      gl.uniform1f(U.uEnergy, still ? 0.15 : energy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [signals]);

  return <canvas ref={ref} className={"aura" + (overArt ? " aura--over-art" : "")} aria-hidden="true" />;
}
