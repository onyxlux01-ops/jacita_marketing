const vertexSource = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

// Original domain-warped cloud field, rendered with one fullscreen triangle.
const fragmentSource = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDetail;
float hash(vec2 point) {
  vec3 p = fract(vec3(point.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  vec2 samplePoint = p;
  for (int i = 0; i < 4; i++) {
    if (float(i) < uDetail) value += amplitude * noise(samplePoint);
    samplePoint = mat2(0.8, -0.6, 0.6, 0.8) * samplePoint * 2.04 + vec2(7.1, 13.7);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;
  vec2 p = uv * vec2(uResolution.x / uResolution.y, 1.0) * 3.2;
  vec2 wind = vec2(uTime * 0.045, -uTime * 0.018);
  vec2 warp = vec2(fbm(p + wind), fbm(p + vec2(4.6, 8.2) - wind * 0.7));
  float density = fbm(p * 0.8 + warp * 1.15 + wind * 0.55);
  density += (0.65 - uv.y) * 0.19;
  float cloud = smoothstep(0.31, 0.67, density);
  vec3 blue = mix(vec3(0.09, 0.43, 0.90), vec3(0.42, 0.68, 0.98), cloud);
  vec3 light = mix(vec3(0.72, 0.86, 1.0), vec3(0.97, 0.99, 1.0), smoothstep(0.47, 0.70, density));
  vec3 color = mix(blue, light, smoothstep(0.38, 0.67, density));
  color += (hash(gl_FragCoord.xy) - 0.5) * 0.009;
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Owns the canvas lifecycle; CSS supplies a permanent no-GPU fallback below it. */
export function startHeroClouds(canvas: HTMLCanvasElement) {
  const host = canvas.parentElement;
  if (!host || typeof ResizeObserver === "undefined" || typeof IntersectionObserver === "undefined") return () => {};
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  const shaders: WebGLShader[] = [];
  let resolution: WebGLUniformLocation | null = null;
  let time: WebGLUniformLocation | null = null;
  let detail: WebGLUniformLocation | null = null;
  let frame = 0, lastDraw = 0, elapsed = 0;
  let visible = false, failed = false, disposed = false;
  const interval = 1000 / 30;

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function release() {
    canvas.removeAttribute("data-ready");
    if (gl) {
      gl.useProgram(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      shaders.forEach(shader => gl!.deleteShader(shader));
    }
    shaders.length = 0;
    program = buffer = null;
    resolution = time = detail = null;
    gl = null;
    canvas.width = canvas.height = 1;
  }
  function fail() {
    failed = true;
    stop();
    release();
  }
  function fit() {
    if (!gl || !program) return;
    const width = Math.max(1, host!.clientWidth);
    const height = Math.max(1, host!.clientHeight);
    const mobile = width < 651;
    const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5);
    const scale = Math.min(ratio, 1600 / width, 1200 / height);
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(detail, mobile ? 3 : 4);
  }
  function initialize() {
    if (program) return true;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: "low-power", preserveDrawingBuffer: false,
      });
      if (!gl || gl.isContextLost()) throw new Error("WebGL unavailable");
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error("Shader unavailable");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Shader compilation failed");
      }
      program = gl.createProgram();
      if (!program) throw new Error("Program unavailable");
      shaders.forEach(shader => gl!.attachShader(program!, shader));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Shader linking failed");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Buffer unavailable");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "aPosition");
      if (position < 0) throw new Error("Position unavailable");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      resolution = gl.getUniformLocation(program, "uResolution");
      time = gl.getUniformLocation(program, "uTime");
      detail = gl.getUniformLocation(program, "uDetail");
      if (resolution === null || time === null || detail === null) throw new Error("Uniform unavailable");
      fit();
      return true;
    } catch {
      fail();
      return false;
    }
  }
  function canRun() {
    return !disposed && !failed && visible && !document.hidden && !preference.matches;
  }
  function tick(now: number) {
    frame = 0;
    if (!canRun() || !gl) return;
    const delta = now - lastDraw;
    if (delta >= interval) {
      elapsed += Math.min(delta, 100) / 1000;
      try {
        gl.uniform1f(time, elapsed);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.setAttribute("data-ready", "true");
        lastDraw = now;
      } catch {
        fail();
        return;
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function resume() {
    if (!canRun() || frame || !initialize()) return;
    lastDraw = performance.now() - interval;
    frame = requestAnimationFrame(tick);
  }
  function visibility() {
    if (document.hidden) stop();
    else resume();
  }
  function motion() {
    if (preference.matches) { stop(); release(); }
    else resume();
  }
  function resize() {
    fit();
    resume();
  }
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) resume();
    else stop();
  });
  const observer = new ResizeObserver(resize);
  canvas.addEventListener("webglcontextlost", fail);
  document.addEventListener("visibilitychange", visibility);
  preference.addEventListener("change", motion);
  window.addEventListener("resize", resize, { passive: true });
  intersection.observe(host);
  observer.observe(host);
  return () => {
    disposed = true;
    stop();
    intersection.disconnect();
    observer.disconnect();
    canvas.removeEventListener("webglcontextlost", fail);
    document.removeEventListener("visibilitychange", visibility);
    preference.removeEventListener("change", motion);
    window.removeEventListener("resize", resize);
    release();
  };
}
