/* ============================================================================
   cover.js — the landing page's cover: one illustrated lymphoblast, drawn in
   a fragment shader and moved by scroll.

   The cell is an illustration, not an image. It is a volume raymarched from
   noise: a ruffled membrane, a large nucleus with a slight cleft and fine
   chromatin, two pale nucleoli. Light from the page ground passes through it
   and is absorbed (Beer–Lambert), which is how a stained cell looks under
   transmitted light: translucent, soft, no highlights. The canvas draws only
   the transmittance and is multiplied onto the page, so where there is no
   cell the page shows through untouched.

   Colour follows the site's rule that a hue names a class. The nucleus is
   violet because a lymphoblast is the leukemic class; the cytoplasm is a
   pale ink-grey, never rose or steel, which mean other things here.

   Scroll is never intercepted. The stage is position:sticky inside a tall
   cover, a scroll listener reads progress 0..1 across it, and that number
   sets the cell's state directly. Frames are drawn only when the number
   changes, so a still page costs the GPU nothing.

   Fallbacks, in order of preference:
     WebGL2 / WebGL1         the cell, moved by scroll
     reduced motion          one static frame of the cell, no movement
     no WebGL, a failed
     compile, a lost context,
     a low-memory device, or
     under 30 fps            the 2D cover field
     no JavaScript           none of this runs; the cover is plain text
   The loading screen is cleared from here on the first frame of whichever
   of those draws, and by the head script after 3 s regardless.
   ========================================================================= */
{
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

/* Called once, whichever path draws first. The head script owns the 3 s
   ceiling, so the loader leaves even if nothing here ever runs. */
const loaderDone = () => {
  if (typeof window.__loaderDone === 'function') window.__loaderDone();
};

const stage  = document.querySelector('.cover__stage');
const cellCv = document.getElementById('cell');
const field  = document.getElementById('coverfield');
const cover  = document.getElementById('top');

/* ── scroll progress across the cover ─────────────────────────────────────
   0 when the cover's top meets the nav, 1 when the sticky stage is about to
   be released. Read straight off layout, so it is always where the page is. */
function progress () {
  if (!cover || !stage) return 0;
  const stickTop = parseFloat(getComputedStyle(stage).top) || 0;
  const run = cover.offsetHeight - stage.offsetHeight;
  if (run <= 0) return 0;
  return Math.max(0, Math.min(1, (stickTop - cover.getBoundingClientRect().top) / run));
}

/* ── the text panels crossfade as they pass the middle of the stage ────── */
const panels = [].slice.call(document.querySelectorAll('.cover__panel'));
function fadePanels () {
  if (REDUCED) return;
  const vh = window.innerHeight;
  panels.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const c = (r.top + r.bottom) / 2;
    /* distance of the panel's centre from the reading line, in viewports */
    const d = Math.abs(c - vh * 0.55) / vh;
    /* the first panel is the cover itself: it never fades in, only out */
    const o = (i === 0 && c > vh * 0.55) ? 1 : Math.max(0, Math.min(1, 1 - (d - 0.12) / 0.3));
    el.style.opacity = o.toFixed(3);
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   The 2D cover field: the fallback whenever the cell cannot be drawn. One
   point per cell in the held-out test set, 1,882, in ink only, scattered by
   a fixed seed. Drawn once, at rest; it does not move with scroll.
   ══════════════════════════════════════════════════════════════════════════ */
function drawField () {
  if (!field) { loaderDone(); return; }
  root.classList.add('cover--field');
  const ctx = field.getContext('2d');
  const N = 851 + 243 + 36 + 752;            /* the test set, as in the matrix */
  const INK = getComputedStyle(root).getPropertyValue('--ink').trim() || '#2E1A3D';

  let seed = 1882;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  while (pts.length < N) {
    const u = rnd(), v = rnd();
    if (rnd() > Math.pow(u, 0.55)) continue;
    pts.push({ u, v, r: 0.8 + rnd() * 1.5, a: 0.14 + Math.pow(rnd(), 2.2) * 0.34 });
  }

  function draw () {
    const box = field.getBoundingClientRect();
    const W = box.width, H = box.height;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    field.width = Math.round(W * dpr); field.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.max(0.5, Math.min(1, Math.sqrt((W * H) / (820 * 840))));
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = INK;
    for (const p of pts) {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(10 + p.u * (W - 20), 10 + p.v * (H - 20), p.r * scale, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  draw();
  loaderDone();
  let rAF;
  window.addEventListener('resize', () => { cancelAnimationFrame(rAF); rAF = requestAnimationFrame(draw); });
}

/* ══════════════════════════════════════════════════════════════════════════
   The cell.
   ══════════════════════════════════════════════════════════════════════════ */
const VERT = `
attribute vec2 aPos;
void main () { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

/* STEPS is a compile-time constant so the loop can unroll on WebGL1. */
const FRAG = (steps) => `
precision highp float;
uniform vec2  uRes;
uniform vec2  uCenter;   /* where the cell sits, in units of half the height */
uniform float uScale;    /* cell size */
uniform float uDist;     /* camera distance */
uniform mat3  uRot;      /* object rotation */

/* Absorption per unit length, per channel. Chosen so light from the page
   ground (#F7F2F4) through the full depth of the nucleus comes out near
   violet #56287E, and through the cytoplasm alone near a pale ink-grey. */
const vec3 SIG_NUC  = vec3(0.66, 1.12, 0.41);
const vec3 SIG_CYT  = vec3(0.095, 0.105, 0.080);
const vec3 SIG_RIM  = vec3(0.55, 0.62, 0.48);

float hash (vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise (vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm (vec3 p) {
  return 0.55 * noise(p) + 0.30 * noise(p * 2.03 + 7.1) + 0.15 * noise(p * 4.07 + 3.3);
}

/* membrane: a sphere with soft ruffles */
float dCell (vec3 q) { return length(q) - (1.0 + 0.085 * (fbm(q * 1.7) - 0.5) * 2.0); }

/* nucleus: large (a lymphoblast's nucleus fills most of the cell), set a
   little off centre, gently lobed, with a shallow cleft carved from one side */
float dNuc (vec3 q) {
  vec3 c = q - vec3(0.07, 0.05, 0.0);
  float d = length(c * vec3(1.0, 1.06, 1.0)) - 0.76 + 0.06 * (fbm(q * 2.6 + 11.0) - 0.5) * 2.0;
  float cleft = length(c - vec3(0.80, 0.40, 0.05)) - 0.22;
  return max(d, -cleft);
}

void main () {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0 - uCenter;
  vec3 ro = vec3(0.0, 0.0, uDist);
  vec3 rd = normalize(vec3(uv * 0.5, -1.0));
  ro = uRot * ro / uScale;
  rd = uRot * rd;

  /* bounding sphere, radius 1.15 in object space */
  float b = dot(ro, rd), c = dot(ro, ro) - 1.3225, h = b * b - c;
  if (h < 0.0) { gl_FragColor = vec4(1.0); return; }
  h = sqrt(h);
  float t0 = max(-b - h, 0.0), t1 = -b + h;
  float dt = (t1 - t0) / float(${steps});

  /* a fixed per-pixel offset breaks up step banding without any motion */
  float j = hash(vec3(gl_FragCoord.xy, 1.0));
  vec3 tau = vec3(0.0);
  for (int i = 0; i < ${steps}; i++) {
    vec3 q = ro + rd * (t0 + (float(i) + j) * dt);
    float dc = dCell(q);
    if (dc > 0.04) continue;
    float inC = smoothstep(0.028, -0.028, dc);
    /* the membrane edge is denser than the cytoplasm inside it */
    float rim = inC * smoothstep(-0.10, 0.0, dc);
    vec3 s = SIG_CYT * inC + SIG_RIM * rim;
    if (length(q) < 0.95) {
      float dn = dNuc(q);
      float inN = smoothstep(0.026, -0.026, dn);
      if (inN > 0.0) {
        /* fine chromatin */
        float chrom = 0.72 + 0.56 * noise(q * 9.0 + 5.0);
        /* two nucleoli, paler than the chromatin around them */
        float nl = smoothstep(0.17, 0.08, length(q - vec3(-0.22, 0.18, 0.12)))
                 + smoothstep(0.13, 0.06, length(q - vec3(0.20, -0.25, -0.10)));
        s += SIG_NUC * inN * chrom * (1.0 - 0.55 * clamp(nl, 0.0, 1.0));
      }
    }
    tau += s * dt * uScale;
  }
  gl_FragColor = vec4(exp(-tau), 1.0);
}
`;

function rotation (ay, ax) {
  const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
  /* Ry * Rx, column-major for uniformMatrix3fv */
  return new Float32Array([
    cy,       0,   -sy,
    sy * sx,  cx,  cy * sx,
    sy * cx, -sx,  cy * cx
  ]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function startCell () {
  if (!cellCv || !stage) return false;
  /* very small devices get the field rather than a struggling shader */
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;

  const opts = { antialias: false, depth: false, stencil: false, alpha: false,
                 premultipliedAlpha: false, preserveDrawingBuffer: false,
                 powerPreference: 'low-power' };
  const gl = cellCv.getContext('webgl2', opts) || cellCv.getContext('webgl', opts);
  if (!gl) return false;

  const phone = window.matchMedia('(max-width: 759.98px)').matches;
  const STEPS = phone ? 28 : 48;
  /* render below device resolution and let CSS scale it up; the volume is
     soft enough that the difference does not show */
  const RES = phone ? 0.5 : 0.75;
  const DPR = Math.min(window.devicePixelRatio || 1, phone ? 1 : 1.5);

  function sh (type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG(STEPS)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) {
    return false;
  }
  gl.useProgram(prog);

  /* one triangle that covers the viewport */
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ['uRes', 'uCenter', 'uScale', 'uDist', 'uRot'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

  let W = 0, H = 0, wide = true;
  function size () {
    const box = cellCv.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    W = Math.max(1, Math.round(box.width * DPR * RES));
    H = Math.max(1, Math.round(box.height * DPR * RES));
    cellCv.width = W; cellCv.height = H;
    gl.viewport(0, 0, W, H);
    wide = box.width >= 760;
    return true;
  }

  /* The scroll story, as one function of p. On wide screens the cell sits
     to the right of the type and drifts toward the centre as it grows; on
     phones it sits in the upper half, above the panels. */
  function state (p) {
    const k = ease(p);
    const aspect = W / H;
    return wide
      ? { cx: aspect * lerp(0.42, 0.30, k), cy: lerp(0.02, -0.04, k),
          scale: lerp(0.78, 1.0, k), dist: lerp(3.6, 3.1, k),
          ay: lerp(-0.35, 1.25, k), ax: lerp(0.30, -0.12, k) }
      : { cx: 0, cy: lerp(0.40, 0.34, k),
          scale: lerp(0.60, 0.66, k), dist: lerp(3.6, 3.3, k),
          ay: lerp(-0.35, 1.25, k), ax: lerp(0.30, -0.12, k) };
  }

  function render (p) {
    const s = state(p);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform2f(U.uCenter, s.cx, s.cy);
    gl.uniform1f(U.uScale, s.scale);
    gl.uniform1f(U.uDist, s.dist);
    gl.uniformMatrix3fv(U.uRot, false, rotation(s.ay, s.ax));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  if (!size()) return false;

  root.classList.add('cover--cell');

  /* Reduced motion: one static frame, a third of the way through the
     story, and nothing moves after that. */
  const P_STATIC = 0.35;
  let last = -1, live = false;
  function frame () {
    if (!live) return;
    const p = REDUCED ? P_STATIC : progress();
    if (p === last) return;
    last = p;
    render(p);
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; frame(); });
  };

  /* ── the 30 fps check ────────────────────────────────────────────────────
     Draw a run of frames across the scroll range, one per animation frame,
     and time the intervals between them. A GPU that cannot finish a frame
     holds the next one back, so slow rendering shows up here without a
     readPixels stall. The first two intervals carry shader compilation and
     are not counted. Over 33 ms on average and the 2D field takes over
     before anyone has watched the cell stutter. */
  const PROBE = 8;
  let n = 0, tPrev = 0, sum = 0, counted = 0;
  function probe (now) {
    if (n > 0 && n > 2) { sum += now - tPrev; counted++; }
    tPrev = now;
    if (n < PROBE) {
      render(n / (PROBE - 1));
      n++;
      requestAnimationFrame(probe);
      return;
    }
    const ms = sum / Math.max(1, counted);
    window.__cellFrameMs = ms;                 /* read by the verification run */
    if (ms > 33) {
      const lose = gl.getExtension('WEBGL_lose_context');
      root.classList.remove('cover--cell');
      if (lose) lose.loseContext();
      drawField();
      return;
    }
    live = true;
    frame();
    loaderDone();
    if (!REDUCED) window.addEventListener('scroll', queue, { passive: true });
  }
  requestAnimationFrame(probe);

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => { if (live && size()) { last = -1; frame(); fadePanels(); } });
  });

  /* if the GPU takes the context back, fall back for good */
  cellCv.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (!live) return;                          /* the probe gave it up on purpose */
    live = false;
    root.classList.remove('cover--cell');
    window.removeEventListener('scroll', queue);
    drawField();
  });
  return true;
}

if (!startCell()) drawField();
fadePanels();
if (!REDUCED) {
  let q = false;
  window.addEventListener('scroll', () => {
    if (q) return; q = true;
    requestAnimationFrame(() => { q = false; fadePanels(); });
  }, { passive: true });
}
}
