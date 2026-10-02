/* ============================================================================
   cover.js — the landing page: one illustrated lymphoblast, rendered in a
   fragment shader, drifting slowly and moved by scroll.

   The cell is an illustration, not an image. It is a volume raymarched from
   noise: a ruffled membrane, a large nucleus with a slight cleft and fine
   chromatin, two paler nucleoli, set among a few out-of-focus cells.

   WHY DARKFIELD, AND WHY NOT FLUORESCENCE — read before changing the look.
   The cell is lit as if under darkfield illumination: the field is black,
   and the cell is visible because its structures scatter light toward the
   eye, so edges, membrane and chromatin glow. Darkfield is a brightfield-
   family technique, a way of looking at the same kind of stained, unlabelled
   cell the dataset is made of. A fluorescence look (cells emitting coloured
   light from dyes or labels) would be prettier still and would also be a
   claim about a different imaging method that has nothing to do with this
   project's data. The illustration is allowed to be cinematic; it is not
   allowed to misrepresent how these cells are imaged. Keep it darkfield.

   Colour follows the site's rule that a hue names a class. The nucleus
   scatters violet because a lymphoblast is the leukemic class; cytoplasm and
   membrane are pale ink-grey and near-white, never rose or steel. The
   out-of-focus cells are neutral grey: they make no claim about any cell.
   Haze, glow and every other gradient exist only inside this canvas; the
   page surfaces around it are flat.

   Motion. Scroll position sets the cell's state directly; the page is never
   intercepted. Between scrolls the cell drifts slowly at 12 fps, and that
   idle drift stops when the cover is out of view, when the tab is hidden, or
   after 45 s with no input, and resumes on the next scroll, pointer move,
   touch or key. Scrolling itself draws at the display's rate.

   Fallbacks, in order of preference:
     WebGL2 / WebGL1          the cell, drifting and moved by scroll
     reduced motion           one static frame of the cell, no movement
     no WebGL, a failed
     compile, a lost context,
     a low-memory device, or
     a median frame > 40 ms   the 2D cover field
     no JavaScript            none of this runs; the cover is plain text
   window.__coverFallback records which, and why.
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

const stage    = document.querySelector('.cover__stage');
const cellCv   = document.getElementById('cell');
const field    = document.getElementById('coverfield');
const cover    = document.getElementById('top');
const pointers = document.getElementById('pointers');
const parts    = document.getElementById('parts');

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

/* Why the cover is not showing the animated cell, for anyone checking
   afterwards in the console. null while the animated cell is running.
     webgl-unavailable   no WebGL2 or WebGL1 context could be created
     low-memory          navigator.deviceMemory reports 2 GB or less
     shader-error        compile or link failed; `detail` has the log
     slow-device         post-warm-up median frame over the threshold;
                         `medianMs` and `framesMs` have the measurement
     context-lost        the GPU took the context back after it was live
     reduced-motion      not a fallback to the field: one static frame of
                         the cell is drawn and nothing moves */
window.__coverFallback = null;
const fallback = (reason, extra) => {
  window.__coverFallback = Object.assign({ reason }, extra || {});
  return false;
};

/* ══════════════════════════════════════════════════════════════════════════
   The 2D cover field: the fallback whenever the cell cannot be drawn. One
   point per cell in the held-out test set, 1,882, in pale ink on the dark
   ground, scattered by a fixed seed. Drawn once, at rest.
   ══════════════════════════════════════════════════════════════════════════ */
function drawField () {
  if (!field) { loaderDone(); return; }
  root.classList.add('cover--field');
  const ctx = field.getContext('2d');
  const N = 851 + 243 + 36 + 752;            /* the test set, as in the matrix */
  const INK = getComputedStyle(root).getPropertyValue('--ink').trim() || '#EEE7F1';

  let seed = 1882;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  while (pts.length < N) {
    const u = rnd(), v = rnd();
    if (rnd() > Math.pow(u, 0.55)) continue;
    pts.push({ u, v, r: 0.8 + rnd() * 1.5, a: 0.10 + Math.pow(rnd(), 2.2) * 0.32 });
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
uniform float uTime;     /* seconds of drift, advanced only while drifting */
uniform float uPar;      /* scroll progress, for the out-of-focus cells' parallax */

/* The page ground, exactly: #120B19. The canvas sits on the same colour. */
const vec3 GROUND = vec3(0.0706, 0.0431, 0.0980);

/* What each structure scatters toward the eye under darkfield light. */
const vec3 C_NUC = vec3(0.52, 0.32, 0.88);   /* violet: a lymphoblast's nucleus */
const vec3 C_CYT = vec3(0.50, 0.47, 0.58);   /* pale ink-grey */
const vec3 C_RIM = vec3(0.90, 0.87, 0.96);   /* near-white membrane edge */
const vec3 C_OOF = vec3(0.55, 0.53, 0.60);   /* the out-of-focus cells: neutral */

float hash (vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float h1 (float x) { return fract(sin(x * 91.3458) * 47453.5453); }
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

/* membrane: a sphere with soft ruffles that move very slowly */
float dCell (vec3 q) {
  return length(q) - (1.0 + 0.085 * (fbm(q * 1.7 + vec3(0.0, 0.0, uTime * 0.03)) - 0.5) * 2.0);
}

/* nucleus: large (a lymphoblast's nucleus fills most of the cell), set a
   little off centre, gently lobed, with a shallow cleft carved from one side */
float dNuc (vec3 q) {
  vec3 c = q - vec3(0.07, 0.05, 0.0);
  float d = length(c * vec3(1.0, 1.06, 1.0)) - 0.76 + 0.06 * (fbm(q * 2.6 + 11.0) - 0.5) * 2.0;
  float cleft = length(c - vec3(0.80, 0.40, 0.05)) - 0.22;
  return max(d, -cleft);
}

void main () {
  vec2 scr = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y * 2.0;
  vec2 uv = scr - uCenter;
  float aspect = uRes.x / uRes.y;
  vec3 col = GROUND;

  /* haze: light scattered by the medium around the cell, a faint lift
     that falls off with distance from it */
  col += vec3(0.030, 0.020, 0.045) * exp(-dot(uv, uv) * 0.55);

  /* out-of-focus cells at other depths: soft discs with a brighter rim,
     the way a cell well outside the focal plane blurs */
  for (int i = 0; i < 8; i++) {
    float fi = float(i) + 1.0;
    vec2 c = vec2(h1(fi * 3.1) * 2.0 - 1.0, h1(fi * 7.7) * 2.0 - 1.0) * vec2(aspect * 1.05, 1.05);
    c += vec2(sin(uTime * 0.045 + fi * 2.3), cos(uTime * 0.037 + fi * 1.7)) * 0.05;
    c.y += uPar * (0.25 + 0.6 * h1(fi * 5.3));
    float rad = 0.09 + 0.20 * h1(fi * 1.3);
    float d = length(scr - c);
    float disc = smoothstep(rad, rad * 0.45, d);
    float rim  = smoothstep(rad * 0.55, rad * 0.92, d) * smoothstep(rad * 1.02, rad * 0.9, d);
    col += C_OOF * (0.020 * disc + 0.030 * rim) * (0.45 + 0.55 * h1(fi * 9.1));
  }

  vec3 ro = vec3(0.0, 0.0, uDist);
  vec3 rd = normalize(vec3(uv * 0.5, -1.0));
  ro = uRot * ro / uScale;
  rd = uRot * rd;

  /* bounding sphere, radius 1.15 in object space */
  float b = dot(ro, rd), cc = dot(ro, ro) - 1.3225, h = b * b - cc;
  if (h > 0.0) {
    h = sqrt(h);
    float t0 = max(-b - h, 0.0), t1 = -b + h;
    float dt = (t1 - t0) / float(${steps});
    float j = hash(vec3(gl_FragCoord.xy, 1.0));
    /* the oblique light behind the cell, upper left, in object space: one
       side of every edge catches it and the other falls into shadow */
    vec3 L = normalize(uRot * normalize(vec3(-0.65, 0.55, -0.55)));
    vec3 acc = vec3(0.0);
    float T = 1.0;
    for (int i = 0; i < ${steps}; i++) {
      vec3 q = ro + rd * (t0 + (float(i) + j) * dt);
      float dc = dCell(q);
      if (dc > 0.03) continue;
      float inC = smoothstep(0.028, -0.028, dc);
      float rim = inC * smoothstep(-0.075, 0.0, dc);
      /* darkfield: the interior is dim and the edges carry the light */
      float sC = inC * (0.06 + 0.16 * noise(q * 4.0 + 2.0));
      float lit = clamp(dot(normalize(q), L) * 0.5 + 0.5, 0.0, 1.0);
      float sR = rim * rim * 3.6 * (0.12 + 1.7 * lit * lit);
      float sN = 0.0;
      if (length(q) < 0.95) {
        float inN = smoothstep(0.026, -0.026, dNuc(q));
        if (inN > 0.0) {
          /* chromatin in clumps, coarse enough to survive the integration
             along each ray, with a finer grain over it */
          float clump = noise(q * 4.2 + 5.0);
          float chrom = 0.10 + 2.4 * pow(clump, 2.6) + 0.30 * noise(q * 11.0 + 1.0);
          float nl = smoothstep(0.17, 0.08, length(q - vec3(-0.22, 0.18, 0.12)))
                   + smoothstep(0.13, 0.06, length(q - vec3(0.20, -0.25, -0.10)));
          /* the nucleus's own edge scatters more than its middle */
          float nEdge = smoothstep(-0.16, 0.0, dNuc(q));
          sN = inN * chrom * (1.0 - 0.6 * clamp(nl, 0.0, 1.0)) * (0.55 + 1.2 * nEdge) * (0.55 + 0.9 * lit);
        }
      }
      /* the far side is lit a little more than the near: light arrives from
         behind and is scattered forward, so the cell glows from within */
      float back = 0.75 + 0.35 * smoothstep(0.0, 1.0, float(i) / float(${steps}));
      vec3 e = (C_CYT * sC + C_RIM * sR + C_NUC * sN) * back;
      float ext = sC * 0.6 + sR * 0.30 + sN * 0.45;
      acc += T * e * dt * uScale;
      T *= exp(-ext * dt * uScale);
    }
    /* a soft shoulder on the scattered light only, so the ground stays exact */
    acc = acc / (1.0 + acc * 0.30);
    col = col * T + acc;
  }

  /* fixed grain, so the darks do not band */
  col += (hash(vec3(gl_FragCoord.xy, 7.0)) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
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
  if (!cellCv || !stage) return fallback('webgl-unavailable', { detail: 'no stage in the page' });
  /* very small devices get the field rather than a struggling shader */
  if (navigator.deviceMemory && navigator.deviceMemory <= 2) {
    return fallback('low-memory', { deviceMemory: navigator.deviceMemory });
  }

  const opts = { antialias: false, depth: false, stencil: false, alpha: false,
                 premultipliedAlpha: false, preserveDrawingBuffer: false,
                 powerPreference: 'low-power' };
  const gl = cellCv.getContext('webgl2', opts) || cellCv.getContext('webgl', opts);
  if (!gl) return fallback('webgl-unavailable');

  const phone = window.matchMedia('(max-width: 759.98px)').matches;
  const STEPS = phone ? 28 : 40;
  /* render below device resolution and let CSS scale it up; the volume is
     soft enough that the difference does not show */
  const RES = phone ? 0.5 : 0.62;
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
    return fallback('shader-error', { detail: String(e && e.message || e) });
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
  ['uRes', 'uCenter', 'uScale', 'uDist', 'uRot', 'uTime', 'uPar'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

  let W = 0, H = 0, cssW = 0, cssH = 0, wide = true;
  function size () {
    const box = cellCv.getBoundingClientRect();
    if (!box.width || !box.height) return false;
    cssW = box.width; cssH = box.height;
    W = Math.max(1, Math.round(box.width * DPR * RES));
    H = Math.max(1, Math.round(box.height * DPR * RES));
    cellCv.width = W; cellCv.height = H;
    gl.viewport(0, 0, W, H);
    wide = box.width >= 760;
    if (typeof measureType === 'function') measureType();
    return true;
  }

  /* Seconds of drift. Advanced only while the idle loop is running, so a
     paused cell resumes exactly where it stopped instead of jumping. */
  let drift = 0;

  /* The scroll story, as one function of p, with the slow drift laid over
     it. On wide screens the cell sits right of the type and turns toward the
     viewer as the page scrolls; on phones it sits between the corner lines
     and the wordmark. */
  function state (p) {
    const k = ease(p), t = drift;
    const aspect = W / H;
    const s = wide
      ? { cx: aspect * lerp(0.30, 0.20, k), cy: lerp(0.10, 0.04, k),
          scale: lerp(0.86, 1.08, k), dist: lerp(3.6, 3.15, k),
          ay: lerp(-0.35, 1.25, k), ax: lerp(0.30, -0.12, k) }
      : { cx: 0, cy: lerp(0.36, 0.33, k),
          scale: lerp(0.50, 0.55, k), dist: lerp(3.6, 3.4, k),
          ay: lerp(-0.35, 1.25, k), ax: lerp(0.30, -0.12, k) };
    s.ay += t * 0.03 + 0.10 * Math.sin(t * 0.11);
    s.ax += 0.05 * Math.sin(t * 0.07 + 1.3);
    s.cx += 0.020 * Math.sin(t * 0.090);
    s.cy += 0.018 * Math.sin(t * 0.130 + 0.7);
    return s;
  }

  /* ── the part labels ─────────────────────────────────────────────────────
     Three points on the illustrated anatomy, projected to the screen with
     the same camera the shader uses, each joined to its label by a thin
     line. The labels describe the illustration, not a measurement. */
  const NS = 'http://www.w3.org/2000/svg';
  const labelEls = parts ? {
    nucleus:   parts.querySelector('[data-part="nucleus"]'),
    cytoplasm: parts.querySelector('[data-part="cytoplasm"]'),
    membrane:  parts.querySelector('[data-part="membrane"]')
  } : null;
  const lines = {};
  if (pointers && labelEls) {
    Object.keys(labelEls).forEach(k => {
      const pl = document.createElementNS(NS, 'polyline');
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '2');
      pointers.appendChild(pl); pointers.appendChild(dot);
      lines[k] = { pl, dot };
    });
  }
  /* object space -> CSS pixels in the stage, mirroring the shader's camera */
  function project (q, s, M) {
    const wx = M[0] * q[0] + M[1] * q[1] + M[2] * q[2];
    const wy = M[3] * q[0] + M[4] * q[1] + M[5] * q[2];
    const wz = M[6] * q[0] + M[7] * q[1] + M[8] * q[2] - s.dist / s.scale;
    const ux = 2 * wx / -wz + s.cx, uy = 2 * wy / -wz + s.cy;
    return { x: cssW / 2 + ux / 2 * cssH, y: cssH / 2 - uy / 2 * cssH };
  }
  /* Where each label points, chosen by what the eye sees rather than by a
     point on the 3D surface: a point on the front of the membrane is still
     membrane, but on screen it sits over the nucleus and reads as pointing
     at it. So: the nucleus dot inside the projected nucleus; the cytoplasm
     dot in the ring between nucleus and membrane; the membrane dot on the
     visible edge. Each is taken in the direction of its own label, so no
     line crosses the cell. */
  const NUC_R = 0.76, NUC_C = [0.07, 0.05, 0.0];
  function anchorFor (part, c, n, R, lx, ly) {
    let dx = lx - c.x, dy = ly - c.y;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    if (part === 'nucleus') return { x: n.x + dx * 0.40 * NUC_R * R, y: n.y + dy * 0.40 * NUC_R * R };
    if (part === 'membrane') return { x: c.x + dx * 0.97 * R, y: c.y + dy * 0.97 * R };
    /* cytoplasm: midway between the nucleus's edge and the membrane, in a
       direction near the label's where the ring is widest */
    const mid = (NUC_R + 0.97) / 2;
    let best = null, bd = -1e9;
    for (let k = -3; k <= 3; k++) {
      const a = Math.atan2(dy, dx) + k * 0.18, ux = Math.cos(a), uy = Math.sin(a);
      const q = { x: c.x + ux * mid * R, y: c.y + uy * mid * R };
      const clear = Math.hypot(q.x - n.x, q.y - n.y) - NUC_R * R;
      const score = clear - Math.abs(k) * 2;
      if (score > bd) { bd = score; best = q; }
    }
    return best;
  }
  function placeLabels (s) {
    if (!labelEls || !pointers) return;
    const r = rotation(s.ay, s.ax);
    /* rows of M = columns of the GLSL matrix, which is the inverse rotation */
    const M = [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]];
    const c = project([0, 0, 0], s, M);
    const n = project(NUC_C, s, M);
    const R = s.scale / s.dist * cssH;                         /* cell radius, px */
    const pad = 14;
    const spots = wide
      ? { nucleus: [-1.55, -0.95], cytoplasm: [-1.45, 1.05], membrane: [1.35, 0.75] }
      : { nucleus: [-1.05, -1.30], cytoplasm: [-1.12, 0.62], membrane: [1.08, -0.95] };
    /* no label may sit in or below the type block, wherever the cell drifts */
    const floor = typeFloor() - 8;
    for (const k of Object.keys(labelEls)) {
      const el = labelEls[k];
      const left = spots[k][0] < 0;
      let lx = c.x + spots[k][0] * R, ly = c.y + spots[k][1] * R;
      const a = anchorFor(k, c, n, R, lx, ly);
      const w = el.offsetWidth;
      lx = Math.max(pad + (left ? w : 0), Math.min(cssW - pad - (left ? 0 : w), lx));
      ly = Math.max(pad + 12, Math.min(floor, ly));
      el.style.transform = `translate(${(left ? lx - w : lx).toFixed(1)}px, ${(ly - 14).toFixed(1)}px)`;
      /* anchor -> elbow -> a short rule under the label */
      const ex = left ? lx : lx;
      const ux = left ? lx - w : lx + w;
      lines[k].pl.setAttribute('points',
        `${a.x.toFixed(1)},${a.y.toFixed(1)} ${ex.toFixed(1)},${(ly - 2).toFixed(1)} ${ux.toFixed(1)},${(ly - 2).toFixed(1)}`);
      lines[k].dot.setAttribute('cx', a.x.toFixed(1));
      lines[k].dot.setAttribute('cy', a.y.toFixed(1));
    }
  }

  /* the top of the wordmark block, in stage pixels; labels stay above it */
  const mainEl = stage.querySelector('.cover__main');
  let typeTop = Infinity;
  function measureType () {
    if (!mainEl) { typeTop = Infinity; return; }
    typeTop = mainEl.getBoundingClientRect().top - stage.getBoundingClientRect().top;
  }
  const typeFloor = () => (wide ? cssH - 14 : Math.min(cssH - 14, typeTop));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureType(); });

  function render (p) {
    const s = state(p);
    gl.uniform2f(U.uRes, W, H);
    gl.uniform2f(U.uCenter, s.cx, s.cy);
    gl.uniform1f(U.uScale, s.scale);
    gl.uniform1f(U.uDist, s.dist);
    gl.uniform1f(U.uTime, drift);
    gl.uniform1f(U.uPar, p);
    gl.uniformMatrix3fv(U.uRot, false, rotation(s.ay, s.ax));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    placeLabels(s);
  }

  if (!size()) return fallback('webgl-unavailable', { detail: 'canvas has no size' });

  root.classList.add('cover--cell');

  /* Reduced motion: one static frame, a third of the way through the
     story, and nothing moves after that. */
  const P_STATIC = 0.35;
  let last = -1, live = false;
  function frame (force) {
    if (!live) return;
    const p = REDUCED ? P_STATIC : progress();
    if (p === last && !force) return;
    last = p;
    render(p);
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; frame(true); });
  };

  /* ── idle drift ──────────────────────────────────────────────────────────
     12 fps while the cover is in view, the tab is visible and someone has
     touched the page in the last 45 s. Anything else and the loop stops;
     the next input starts it again. */
  /* 12, not 24: at 24 the Iris Xe was busy 25-40% of the time with the page
     untouched. The drift is slow enough that 12 still reads as smooth. */
  const IDLE_FRAME_MS = 1000 / 12, IDLE_AFTER_MS = 45000;
  let inView = true, idle = false, idleTimer = 0, loop = 0, lastTick = 0;
  const running = () => live && !REDUCED && inView && !idle && !document.hidden;
  /* Draws are scheduled against a running target time rather than a
     minimum gap, so the average holds at the target rate on any refresh
     rate: a fixed minimum gap rounds up to the next whole display frame
     (at 24 fps on 60 Hz that had given 20). */
  let nextAt = 0;
  function tick (now) {
    loop = 0;
    if (!running()) return;
    if (now >= nextAt - 2) {
      drift += Math.min(now - lastTick, 100) / 1000;
      lastTick = now;
      nextAt += IDLE_FRAME_MS;
      if (now - nextAt > IDLE_FRAME_MS) nextAt = now + IDLE_FRAME_MS;   /* fell behind: resync */
      frame(true);
    }
    loop = requestAnimationFrame(tick);
  }
  function startLoop () {
    if (loop || !running()) return;
    lastTick = performance.now();
    nextAt = lastTick + IDLE_FRAME_MS;
    loop = requestAnimationFrame(tick);
  }
  function wake () {
    if (REDUCED || !live) return;
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { idle = true; }, IDLE_AFTER_MS);
    startLoop();
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => { inView = es[es.length - 1].isIntersecting; if (inView) startLoop(); })
      .observe(stage);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) startLoop(); });

  function goLive () {
    live = true;
    frame(true);
    loaderDone();
    if (!REDUCED) {
      window.addEventListener('scroll', () => { queue(); wake(); }, { passive: true });
      ['pointermove', 'pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(t =>
        window.addEventListener(t, wake, { passive: true }));
      wake();
    }
  }

  /* Reduced motion draws one frame and never another, so there is nothing
     to keep up with and no reason to measure. */
  if (REDUCED) {
    window.__coverFallback = { reason: 'reduced-motion', mode: 'cell-static' };
    goLive();
  } else {
    /* ── the frame-time check ─────────────────────────────────────────────
       Times the GPU, not the display. Each probe frame is drawn and then
       waited on with a one-pixel readPixels, so the time measured is the
       work for that frame alone; it does not depend on the refresh rate, on
       Chrome capping a page at 30 fps in Energy Saver, or on what else the
       main thread is doing while the page loads.

       The program is already compiled and linked above. Many drivers (ANGLE
       on D3D11 among them) still finish compiling on the first draw, so two
       warm-up frames are drawn and waited on first and then thrown away.
       Seven frames across the scroll range are timed after that, one per
       animation frame, and the median decides, so a single stalled frame
       cannot trip it. Over 40 ms (25 fps), and the field takes over before
       anyone has watched the cell stutter. */
    const px = new Uint8Array(4);
    const flush = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const timed = p => { const t = performance.now(); render(p); flush(); return performance.now() - t; };
    const LIMIT_MS = 40, TIMED = 7;
    const warmupMs = [], framesMs = [];

    requestAnimationFrame(() => {
      warmupMs.push(timed(0), timed(0.5));        /* discarded */
      let k = 0;
      requestAnimationFrame(function probe () {
        framesMs.push(timed(k / (TIMED - 1)));
        if (++k < TIMED) { requestAnimationFrame(probe); return; }
        const sorted = framesMs.slice().sort((a, b) => a - b);
        const medianMs = sorted[(TIMED - 1) / 2];
        const round = a => a.map(v => +v.toFixed(1));
        window.__coverProbe = { warmupMs: round(warmupMs), framesMs: round(framesMs),
                                medianMs: +medianMs.toFixed(1), limitMs: LIMIT_MS };
        window.__cellFrameMs = medianMs;          /* read by the verification run */
        if (medianMs > LIMIT_MS) {
          fallback('slow-device', { medianMs: +medianMs.toFixed(1), framesMs: round(framesMs), limitMs: LIMIT_MS });
          root.classList.remove('cover--cell');
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
          drawField();
          return;
        }
        goLive();
      });
    });
  }

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => { if (live && size()) { last = -1; frame(true); } });
  });

  /* if the GPU takes the context back, fall back for good */
  cellCv.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (!live) return;                          /* the probe gave it up on purpose */
    live = false;
    fallback('context-lost');
    root.classList.remove('cover--cell');
    drawField();
  });
  return true;
}

if (!startCell()) drawField();
}
