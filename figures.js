/* ============================================================================
   figures.js — the three drawings, loaded on demand.

   Imported with dynamic import() the first time the panel that owns a figure
   is activated, so none of this is parsed or run on initial load:
     Results  the 1,882-mark cell field and the ROC curve
     Method   the split schematic

   The ROC points are inlined here rather than fetched, which removes the
   roc.json request from the page entirely. The split schematic has no data
   file behind it; it is generated from a seeded PRNG.
   ========================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Traced from the project's own plot; see roc.png. */
export const ROC = {"fpr":[0.0,0.0,0.0037,0.0037,0.0074,0.0074,0.0111,0.0111,0.0148,0.0148,0.0185,0.0185,0.0221,0.0221,0.0258,0.0258,0.0295,0.0295,0.0332,0.0332,0.0369,0.0369,0.0406,0.0406,0.0443,0.0443,0.0517,0.0517,0.0554,0.0554,0.0627,0.0627,0.0664,0.0775,0.0812,0.0812,0.0959,0.0959,0.0996,0.0996,0.1107,0.1107,0.1144,0.1144,0.1181,0.1181,0.1218,0.1218,0.1255,0.1255,0.1292,0.1292,0.1328,0.1328,0.1365,0.1365,0.1402,0.1402,0.1439,0.1513,0.1624,0.1624,0.1882,0.1882,0.2066,0.2066,0.2251,0.2399,0.2435,0.2546,0.2731,0.2731,0.2915,0.2915,0.31,0.321,0.3284,0.3321,0.3506,0.3506,0.369,0.3727,0.3838,0.3911,0.4059,0.4096,0.4244,0.428,0.4428,0.4502,0.4649,0.4649,0.4797,0.4871,0.4982,0.5055,0.5203,0.5203,0.5387,0.5424,0.5572,0.5609,0.5793,0.5793,0.5941,0.6015,0.6125,0.6199,0.6347,0.6347,0.6531,0.6568,0.6716,0.6753,0.6937,0.6937,0.7085,0.7159,0.7269,0.7343,0.7491,0.7491,0.7675,0.7712,0.786,0.7897,0.8044,0.8081,0.8229,0.8303,0.8413,0.8487,0.8635,0.8635,0.8819,0.8856,0.9004,0.9041,0.9114,0.9114,0.9188,0.9299,0.9483,0.952,0.9631,0.9668,0.9852,0.9852,1.0],"tpr":[0.0,0.2281,0.2471,0.346,0.3574,0.403,0.403,0.4449,0.4563,0.4829,0.4905,0.5133,0.5171,0.5361,0.5437,0.5551,0.5589,0.5703,0.5703,0.5817,0.5856,0.5932,0.597,0.6084,0.6084,0.6198,0.6312,0.635,0.635,0.6426,0.6502,0.6578,0.6578,0.6844,0.6844,0.6882,0.7034,0.7072,0.7072,0.711,0.7224,0.7262,0.7262,0.73,0.73,0.7338,0.7338,0.7376,0.7376,0.7414,0.7414,0.7452,0.7452,0.749,0.749,0.7529,0.7529,0.7567,0.7567,0.7643,0.7681,0.7719,0.7833,0.7871,0.7947,0.7985,0.8061,0.8175,0.8175,0.8251,0.8289,0.8327,0.8365,0.8403,0.8441,0.8517,0.8517,0.8555,0.8593,0.8631,0.8631,0.8669,0.8669,0.8707,0.8707,0.8745,0.8745,0.8783,0.8783,0.8821,0.8821,0.8859,0.8859,0.8897,0.8897,0.8935,0.8935,0.8973,0.8973,0.9011,0.9011,0.9049,0.9049,0.9087,0.9087,0.9125,0.9125,0.9163,0.9163,0.9202,0.9202,0.924,0.924,0.9278,0.9278,0.9316,0.9316,0.9354,0.9354,0.9392,0.9392,0.943,0.943,0.9468,0.9468,0.9506,0.9506,0.9544,0.9544,0.9582,0.9582,0.962,0.962,0.9658,0.9658,0.9696,0.9696,0.9734,0.9734,0.9772,0.9772,0.9848,0.9886,0.9924,0.9924,0.9962,0.9962,1.0,1.0],"auc":0.858};

/* Figures that sit on paper. Crimson means "leukemia is present in this
   cell" — solid where it was caught, hollow where it was not. */
/* Read the palette out of the stylesheet instead of keeping a second copy of
   it here. These two did drift: --ink-note was raised from .50 to .60 to clear
   AA, and this file kept its own .50 literal, so every figure label -- the
   schematic's "not data" caption and the ROC operating-point description among
   them -- stayed below contrast while the rest of the page was fixed.

   Both a canvas fillStyle and an SVG fill accept whatever a custom property
   holds, including rgba(), so no literal is needed at either site. The
   fallbacks below apply only if a property is missing altogether, and each one
   is the token's current value; if you change a token, change nothing here. */
const cssVar = (name, fallback) => {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
  return v || fallback;
};

const C = {
  detect: cssVar('--detect',    '#C81E5A'),
  accent: cssVar('--accent',    '#0C4A6E'),
  faint:  cssVar('--ink-faint', 'rgba(17,17,17,.16)'),
  ink:    cssVar('--ink',       '#111111'),
  soft:   cssVar('--ink-note',  'rgba(17,17,17,.60)'),
  rule:   cssVar('--rule',      'rgba(17,17,17,.10)'),
  firm:   cssVar('--rule-bold', 'rgba(17,17,17,.24)'),
  paper:  cssVar('--paper',     '#FAFAF8')
};

/* The ROC sits on the dark full-bleed band, so its text is light-on-dark and
   none of the tokens above apply. There is no token for these; they exist only
   here. Measured against the band's #111111: the tick and axis labels are
   6.00:1, the operating-point label 6.43:1, the AUC label 18.07:1. If a
   band-local token set is ever added to style.css, point these at it the same
   way C is pointed at the page tokens. */
const CD = {
  curve: '#7FB6D4',
  mark:  '#FF5C8A',
  ink:   '#FAFAF8',
  soft:  'rgba(250,250,248,.55)',
  rule:  'rgba(250,250,248,.12)',
  firm:  'rgba(250,250,248,.26)',
  panel: '#111111'
};

/* Measured on 1,882 cells from 11 held-out patients. Read off the operating
   marker in roc.png (threshold 0.770, FPR 0.045 / TPR 0.778) against the
   1,094 / 788 class totals. */
const COUNTS = { tp: 851, fn: 243, fp: 36, tn: 752 };
const N_LEUK = COUNTS.tp + COUNTS.fn;   // 1094
const N_NORM = COUNTS.fp + COUNTS.tn;   //  788
const N_ALL  = N_LEUK + N_NORM;         // 1882
const THRESHOLD = 0.770;

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
};
/* ══════════════════════════════════════════════════════════════════════════
   1. The cell field — one mark per cell in the test set
   ══════════════════════════════════════════════════════════════════════════ */
let cellFieldMounted = false;
export function mountCellField () {
  if (cellFieldMounted) return; cellFieldMounted = true;
  const cv = document.getElementById('cellfield');
  if (!cv) return;
  const ctx = cv.getContext('2d');

  let dots = [], W = 0, H = 0, pitch = 11, radius = 3.5;
  let progress = 0, highlight = null, played = false;

  function layout () {
    W = cv.parentElement.clientWidth;
    const cols = Math.max(22, Math.min(74, Math.floor(W / 11)));
    pitch  = W / cols;
    radius = Math.max(2.2, pitch * 0.31);

    const labelH = 24, gap = Math.round(pitch * 2.6);
    const rowsA = Math.ceil(N_LEUK / cols);
    const rowsB = Math.ceil(N_NORM / cols);
    const yA = labelH;
    const yB = labelH + rowsA * pitch + gap + labelH;

    dots = [];
    /* Upper block: the cells that really were leukemic.
       Caught first, missed last — so the misses sit along the bottom edge. */
    for (let i = 0; i < N_LEUK; i++) {
      dots.push({
        x: (i % cols) * pitch + pitch / 2,
        y: yA + Math.floor(i / cols) * pitch + pitch / 2,
        g: i < COUNTS.tp ? 'tp' : 'fn'
      });
    }
    /* Lower block: the cells that really were normal.
       False alarms first — so the two kinds of error meet across the gap. */
    for (let j = 0; j < N_NORM; j++) {
      dots.push({
        x: (j % cols) * pitch + pitch / 2,
        y: yB + Math.floor(j / cols) * pitch + pitch / 2,
        g: j < COUNTS.fp ? 'fp' : 'tn'
      });
    }

    H = yB + rowsB * pitch + 4;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cv._labels = [
      { t: '1,094 cells that were leukemic', y: yA - 9 },
      { t: '788 cells that were normal',     y: yB - 9 }
    ];
  }

  function draw () {
    ctx.clearRect(0, 0, W, H);

    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.soft;
    for (const l of cv._labels) ctx.fillText(l.t, 0, l.y);

    const shown = Math.floor(dots.length * progress);
    for (let i = 0; i < shown; i++) {
      const d = dots[i];
      const dim = highlight && highlight !== d.g;
      ctx.globalAlpha = dim ? 0.10 : 1;

      const hollow = d.g === 'fn' || d.g === 'fp';
      ctx.beginPath();
      if (hollow) {
        /* the fill that should have been there, in the case of a miss */
        ctx.arc(d.x, d.y, Math.max(1.7, radius - 0.5), 0, 6.2832);
        ctx.lineWidth = Math.max(1.1, radius * 0.48);
        ctx.strokeStyle = d.g === 'fn' ? C.detect : C.accent;
        ctx.stroke();
      } else {
        ctx.arc(d.x, d.y, radius, 0, 6.2832);
        ctx.fillStyle = d.g === 'tp' ? C.detect : C.faint;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function play () {
    if (played) return;
    played = true;
    if (REDUCED) { progress = 1; draw(); return; }
    const t0 = performance.now(), dur = 750;
    (function step (now) {
      const t = Math.min(1, (now - t0) / dur);
      progress = 1 - Math.pow(1 - t, 3);
      draw();
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }

  layout(); draw();

  new IntersectionObserver((entries, obs) => {
    if (entries[0].isIntersecting) { play(); obs.disconnect(); }
  }, { threshold: 0.15 }).observe(cv);

  /* A panel that is not on screen has zero width, so laying out while it is
     hidden would size the canvas to nothing and blank the field -- and
     mounting is one-shot, so it would never come back. Skip those, and catch
     up when the panel is shown again. layout() rebuilds the dots without
     touching progress, so re-running it redraws the same field. */
  const relayout = () => { if (cv.parentElement.clientWidth) { layout(); draw(); } };

  let rAF;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(relayout);
  });
  document.addEventListener('panel:show', e => {
    if (e.detail && e.detail.id === 'results') requestAnimationFrame(relayout);
  });

  /* Legend doubles as the isolation control. */
  const legend = document.getElementById('legend');
  const buttons = [...legend.querySelectorAll('button')];
  buttons.forEach(b => b.setAttribute('aria-pressed', 'false'));

  function setHighlight (g) {
    highlight = g;
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.group === g)));
    if (!played) { progress = 1; played = true; }
    draw();
  }

  legend.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b) setHighlight(highlight === b.dataset.group ? null : b.dataset.group);
  });
  legend.addEventListener('pointerover', e => {
    const b = e.target.closest('button');
    if (b && !buttons.some(x => x.getAttribute('aria-pressed') === 'true')) {
      highlight = b.dataset.group; draw();
    }
  });
  legend.addEventListener('pointerleave', () => {
    if (!buttons.some(x => x.getAttribute('aria-pressed') === 'true')) { highlight = null; draw(); }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   2. ROC curve
   ══════════════════════════════════════════════════════════════════════════ */
let rocMounted = false;
export function mountRoc (THRESHOLD) {
  if (rocMounted) return; rocMounted = true;
  const host = document.getElementById('roc');
  if (!host) return;

  /* Real fpr/tpr arrays from the evaluation run. roc.json is
     { "fpr": [...], "tpr": [...], "auc": <number> }. There is no fallback: the
     traced curve that used to stand in here belonged to the withdrawn
     evaluation, and a stale curve is worse than no curve. */
  const fpr = ROC.fpr, tpr = ROC.tpr, auc = ROC.auc;

  const w = 400, h = 400, M = { l: 52, r: 10, t: 10, b: 38 };
  const px = v => M.l + v * (w - M.l - M.r);
  const py = v => h - M.b - v * (h - M.t - M.b);

  const s = svg('svg', {
    viewBox: `0 0 ${w} ${h}`, role: 'img',
    'aria-label': 'Receiver operating characteristic curve, area under curve ' + auc.toFixed(3) +
      '. At the operating threshold of ' + THRESHOLD.toFixed(3) + ' the false positive rate is ' +
      (COUNTS.fp / N_NORM).toFixed(3) + ' and the true positive rate is ' +
      (COUNTS.tp / N_LEUK).toFixed(3) + '.'
  });

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  for (const t of ticks) {
    s.appendChild(svg('line', { x1: px(t), y1: py(0), x2: px(t), y2: py(1), stroke: CD.rule, 'stroke-width': 1 }));
    s.appendChild(svg('line', { x1: px(0), y1: py(t), x2: px(1), y2: py(t), stroke: CD.rule, 'stroke-width': 1 }));

    const lx = svg('text', { x: px(t), y: py(0) + 17, fill: CD.soft, 'font-size': 10,
      'text-anchor': 'middle', 'font-family': '"JetBrains Mono", ui-monospace, monospace' });
    lx.textContent = t.toFixed(1); s.appendChild(lx);

    const ly = svg('text', { x: px(0) - 8, y: py(t) + 3.5, fill: CD.soft, 'font-size': 10,
      'text-anchor': 'end', 'font-family': '"JetBrains Mono", ui-monospace, monospace' });
    ly.textContent = t.toFixed(1); s.appendChild(ly);
  }

  /* chance line */
  s.appendChild(svg('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(1),
    stroke: CD.firm, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));

  /* axes */
  s.appendChild(svg('line', { x1: px(0), y1: py(0), x2: px(1), y2: py(0), stroke: CD.soft, 'stroke-width': 1 }));
  s.appendChild(svg('line', { x1: px(0), y1: py(0), x2: px(0), y2: py(1), stroke: CD.soft, 'stroke-width': 1 }));

  /* the curve — a full ROC has one point per distinct score, so drop points
     that land on the same device pixel rather than emitting 1,800 of them */
  let d = '', lastX = NaN, lastY = NaN;
  for (let i = 0; i < fpr.length; i++) {
    const X = +px(fpr[i]).toFixed(2), Y = +py(tpr[i]).toFixed(2);
    if (X === lastX && Y === lastY) continue;
    d += (d ? 'L' : 'M') + X + ' ' + Y;
    lastX = X; lastY = Y;
  }
  s.appendChild(svg('path', { d, fill: 'none', stroke: CD.curve, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  /* the operating point actually used: 179/788 and 797/1094 */
  const ox = COUNTS.fp / N_NORM, oy = COUNTS.tp / N_LEUK;
  s.appendChild(svg('line', { x1: px(0), y1: py(oy), x2: px(ox), y2: py(oy),
    stroke: CD.mark, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  s.appendChild(svg('line', { x1: px(ox), y1: py(0), x2: px(ox), y2: py(oy),
    stroke: CD.mark, 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
  s.appendChild(svg('circle', { cx: px(ox), cy: py(oy), r: 4.5,
    fill: CD.panel, stroke: CD.mark, 'stroke-width': 2.5 }));

  const opLabel = svg('text', { x: px(ox) + 11, y: py(oy) + 15, fill: CD.mark, 'font-size': 10,
    'font-family': '"JetBrains Mono", ui-monospace, monospace', 'font-weight': 600 });
  opLabel.textContent = 'threshold ' + THRESHOLD.toFixed(3);
  s.appendChild(opLabel);
  const opSub = svg('text', { x: px(ox) + 11, y: py(oy) + 28, fill: CD.mark, 'font-size': 9.5,
    'font-family': '"JetBrains Mono", ui-monospace, monospace' });
  opSub.textContent = (COUNTS.fp / N_NORM).toFixed(3) + ' fpr / ' +
                      (COUNTS.tp / N_LEUK).toFixed(3) + ' tpr';
  s.appendChild(opSub);

  const aucLabel = svg('text', { x: px(0.98), y: py(0.06), fill: CD.ink, 'font-size': 11,
    'text-anchor': 'end', 'font-family': '"JetBrains Mono", ui-monospace, monospace', 'font-weight': 600 });
  aucLabel.textContent = 'AUC ' + auc.toFixed(3);
  s.appendChild(aucLabel);

  const ax = svg('text', { x: px(0.5), y: h - 4, fill: CD.soft, 'font-size': 10.5,
    'text-anchor': 'middle', 'font-family': '"JetBrains Mono", ui-monospace, monospace' });
  ax.textContent = 'false positive rate';
  s.appendChild(ax);

  const ay = svg('text', { x: 13, y: py(0.5), fill: CD.soft, 'font-size': 10.5,
    'text-anchor': 'middle', 'font-family': '"JetBrains Mono", ui-monospace, monospace',
    transform: `rotate(-90 13 ${py(0.5)})` });
  ay.textContent = 'true positive rate';
  s.appendChild(ay);

  host.replaceChildren(s);
}

/* ══════════════════════════════════════════════════════════════════════════
   3. Split schematic — how one patient's cells land under each split
   ══════════════════════════════════════════════════════════════════════════ */
let splitMounted = false;
export function mountSplit () {
  if (splitMounted) return; splitMounted = true;
  const host = document.getElementById('splitfig');
  if (!host) return;

  const W = 640, PANEL = 152, NOTE_DY = 146, KEY_Y = PANEL + 26 + NOTE_DY + 28;
  const s = svg('svg', {
    viewBox: `0 0 ${W} ${KEY_Y + 10}`, role: 'img',
    'aria-label': 'Schematic. Under a random split by image, cells from patient 07 appear in ' +
      'both the training set and the test set. Under a split by patient, all of patient 07 sits ' +
      'in the training set and none of it is in the test set.'
  });

  const text = (x, y, str, o = {}) => {
    const t = svg('text', Object.assign({
      x, y, 'font-size': 10.5, fill: C.soft, 'font-family': '"JetBrains Mono", ui-monospace, monospace'
    }, o));
    t.textContent = str;
    s.appendChild(t);
  };

  /* deterministic scatter, so the drawing is identical on every load */
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const scatter = (n, total) => {
    const set = new Set();
    while (set.size < n) set.add(Math.floor(rnd() * total));
    return set;
  };

  const BINS = [
    { x: 0,   w: 372, label: 'training set', cols: 24 },
    { x: 398, w: 158, label: 'test set',     cols: 10 }
  ];
  const ROWS = 4, BH = 86;

  function panel (y0, title, note, pick, alarmTestBin) {
    text(0, y0 + 11, title, { fill: C.ink, 'font-weight': 600, 'font-size': 11.5 });

    for (const bin of BINS) {
      const by = y0 + 26;
      const leaking = alarmTestBin && bin.label === 'test set';
      s.appendChild(svg('rect', {
        x: bin.x, y: by, width: bin.w, height: BH, fill: 'none',
        stroke: leaking ? C.accent : C.rule, 'stroke-width': leaking ? 1.5 : 1
      }));
      text(bin.x + 2, by + BH + 15, bin.label,
        leaking ? { fill: C.accent, 'font-weight': 600 } : {});

      const dx = bin.w / bin.cols, dy = BH / ROWS, total = ROWS * bin.cols;
      const flagged = pick(bin, total);
      for (let i = 0; i < total; i++) {
        const isP7 = flagged.has(i);
        s.appendChild(svg('circle', {
          cx: (bin.x + (i % bin.cols) * dx + dx / 2).toFixed(1),
          cy: (by + Math.floor(i / bin.cols) * dy + dy / 2).toFixed(1),
          r: isP7 ? 4 : 3.2,
          fill: isP7 ? C.accent : C.faint
        }));
      }
    }
    text(0, y0 + NOTE_DY, note, { fill: alarmTestBin ? C.accent : C.soft, 'font-size': 10.5 });
  }

  panel(0, 'Split by image  —  the first version',
    "patient 07's cells are on both sides of the wall",
    bin => scatter(bin.label === 'training set' ? 11 : 5, ROWS * bin.cols), true);

  s.appendChild(svg('line', { x1: 0, y1: PANEL + 10, x2: W, y2: PANEL + 10,
    stroke: C.rule, 'stroke-width': 1 }));

  panel(PANEL + 26, 'Split by patient  —  what is published',
    'patient 07 is in one place only, so the test set is a real question',
    bin => bin.label === 'training set' ? scatter(16, ROWS * bin.cols) : new Set(), false);

  /* key */
  s.appendChild(svg('circle', { cx: 4, cy: KEY_Y - 3.5, r: 4, fill: C.accent }));
  text(15, KEY_Y, 'cells from patient 07');
  s.appendChild(svg('circle', { cx: 172, cy: KEY_Y - 3.5, r: 3.2, fill: C.faint }));
  text(183, KEY_Y, 'cells from every other patient');

  host.appendChild(s);
}

