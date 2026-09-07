/* ============================================================================
   Leukemic lymphoblast screening aid

   Three drawings and one demo:
     1. the field of 1,882 test cells
     2. the ROC curve (points traced from the project's own plot, roc-data.js)
     3. a schematic of the two ways to split the dataset
     4. the model, run client-side with onnxruntime-web
   ========================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Figures that sit on paper. Crimson means "leukemia is present in this
   cell" — solid where it was caught, hollow where it was not. */
const C = {
  detect: '#C81E5A',
  accent: '#0C4A6E',
  faint:  'rgba(17,17,17,.16)',
  ink:    '#111111',
  soft:   'rgba(17,17,17,.50)',
  rule:   'rgba(17,17,17,.10)',
  firm:   'rgba(17,17,17,.24)',
  paper:  '#FAFAF8'
};
/* The ROC sits on the dark full-bleed band and needs its own values. */
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
(function cellField () {
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

    ctx.font = '500 11px "IBM Plex Mono", monospace';
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

  let rAF;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(() => { layout(); draw(); });
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
})();

/* ══════════════════════════════════════════════════════════════════════════
   2. ROC curve
   ══════════════════════════════════════════════════════════════════════════ */
(async function roc () {
  const host = document.getElementById('roc');
  if (!host) return;

  /* Real fpr/tpr arrays from the evaluation run. roc.json is
     { "fpr": [...], "tpr": [...], "auc": <number> }. There is no fallback: the
     traced curve that used to stand in here belonged to the withdrawn
     evaluation, and a stale curve is worse than no curve. */
  let fpr, tpr, auc;
  try {
    const r = await fetch('roc.json');
    if (!r.ok) throw new Error('roc.json returned HTTP ' + r.status);
    const j = await r.json();
    fpr = j.fpr; tpr = j.tpr; auc = j.auc;
    if (!Array.isArray(fpr) || !Array.isArray(tpr) || !fpr.length || fpr.length !== tpr.length) {
      throw new Error('roc.json needs equal-length fpr and tpr arrays');
    }
    if (typeof auc !== 'number') {                       /* trapezoid, if not supplied */
      auc = 0;
      for (let i = 1; i < fpr.length; i++) auc += (fpr[i] - fpr[i-1]) * (tpr[i] + tpr[i-1]) / 2;
      auc = Math.abs(auc);
    }
  } catch (e) {
    const note = document.createElement('p');
    note.className = 'roc-pending';
    note.textContent = 'Curve not yet generated for this evaluation.';
    host.replaceChildren(note);
    return;
  }

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
      'text-anchor': 'middle', 'font-family': '"IBM Plex Mono", monospace' });
    lx.textContent = t.toFixed(1); s.appendChild(lx);

    const ly = svg('text', { x: px(0) - 8, y: py(t) + 3.5, fill: CD.soft, 'font-size': 10,
      'text-anchor': 'end', 'font-family': '"IBM Plex Mono", monospace' });
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
    'font-family': '"IBM Plex Mono", monospace', 'font-weight': 600 });
  opLabel.textContent = 'threshold ' + THRESHOLD.toFixed(3);
  s.appendChild(opLabel);
  const opSub = svg('text', { x: px(ox) + 11, y: py(oy) + 28, fill: CD.mark, 'font-size': 9.5,
    'font-family': '"IBM Plex Mono", monospace' });
  opSub.textContent = (COUNTS.fp / N_NORM).toFixed(3) + ' fpr / ' +
                      (COUNTS.tp / N_LEUK).toFixed(3) + ' tpr';
  s.appendChild(opSub);

  const aucLabel = svg('text', { x: px(0.98), y: py(0.06), fill: CD.ink, 'font-size': 11,
    'text-anchor': 'end', 'font-family': '"IBM Plex Mono", monospace', 'font-weight': 600 });
  aucLabel.textContent = 'AUC ' + auc.toFixed(3);
  s.appendChild(aucLabel);

  const ax = svg('text', { x: px(0.5), y: h - 4, fill: CD.soft, 'font-size': 10.5,
    'text-anchor': 'middle', 'font-family': '"IBM Plex Mono", monospace' });
  ax.textContent = 'false positive rate';
  s.appendChild(ax);

  const ay = svg('text', { x: 13, y: py(0.5), fill: CD.soft, 'font-size': 10.5,
    'text-anchor': 'middle', 'font-family': '"IBM Plex Mono", monospace',
    transform: `rotate(-90 13 ${py(0.5)})` });
  ay.textContent = 'true positive rate';
  s.appendChild(ay);

  host.replaceChildren(s);
})();

/* ══════════════════════════════════════════════════════════════════════════
   3. Split schematic — how one patient's cells land under each split
   ══════════════════════════════════════════════════════════════════════════ */
(function splitFigure () {
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
      x, y, 'font-size': 10.5, fill: C.soft, 'font-family': '"IBM Plex Mono", monospace'
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
})();

/* ══════════════════════════════════════════════════════════════════════════
   4. The demo — the model runs here, in this tab, on your machine
   ══════════════════════════════════════════════════════════════════════════ */
(function demo () {
  const MODEL_URL   = 'models/model.onnx';
  const ORT_VERSION = '1.20.1';
  /* Caffe-style ResNet-50 preprocessing: BGR, mean-subtracted, NOT rescaled. */
  const MEAN_B = 103.939, MEAN_G = 116.779, MEAN_R = 123.68;

  /* ORT is ~3 MB. Nothing fetches it until the visitor asks for the model. */
  let ortPromise = null;
  function ensureOrt () {
    if (typeof ort !== 'undefined') return Promise.resolve();
    if (ortPromise) return ortPromise;
    ortPromise = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSION + '/dist/ort.min.js';
      el.onload  = () => res();
      el.onerror = () => { ortPromise = null; rej(new Error('ort-cdn')); };
      document.head.appendChild(el);
    });
    return ortPromise;
  }

  const $ = id => document.getElementById(id);
  const ack = $('ack'), loadBtn = $('loadBtn'), file = $('file');
  if (!ack) return;

  const modelStatus = $('modelStatus'), fileHint = $('fileHint');
  const progressWrap = $('progressWrap'), progressBar = $('progressBar'), progressTxt = $('progressTxt');
  const result = $('result'), verdict = $('verdict'), prob = $('prob');
  const meterFill = $('meterFill'), preview = $('preview'), errBox = $('demoError');
  const meterMark = $('meterMark'), dropzone = $('dropzone');

  let session = null, busy = false;

  /* Everything that displays the threshold reads THRESHOLD, so the marker and
     the decision can never drift apart. */
  if (meterMark) meterMark.style.setProperty('--thr', (THRESHOLD * 100).toFixed(2) + '%');
  if ($('thrScale'))  $('thrScale').textContent  = 'threshold ' + THRESHOLD.toFixed(3);
  if ($('thrInline')) $('thrInline').textContent = THRESHOLD.toFixed(3);

  /* Count the probability up from zero. rAF, no library; instant if the
     visitor has asked for reduced motion. */
  function countUp (el, target, ms) {
    if (REDUCED) { el.textContent = target.toFixed(3); return; }
    const t0 = performance.now();
    (function step (now) {
      const t = Math.min(1, (now - t0) / ms);
      el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(3);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(3);
    })(t0);
  }

  /* Reveal: restart the stagger, then let the bar transition from zero. */
  function reveal (pLeukemic, flagged) {
    result.classList.remove('is-live', 'is-flagged');
    meterFill.style.transition = 'none';
    meterFill.style.transform  = 'scaleX(0)';
    result.hidden = false;
    void result.offsetWidth;                 /* reflow, so the animation replays */
    result.classList.toggle('is-flagged', flagged);
    result.classList.add('is-live');
    requestAnimationFrame(() => {
      meterFill.style.transition = '';
      meterFill.style.transform  = 'scaleX(' + pLeukemic.toFixed(4) + ')';
    });
    countUp(prob, pLeukemic, 400);
  }

  const setHint = (el, msg, cls) => { el.textContent = msg; el.className = 'demo__hint' + (cls ? ' ' + cls : ''); };

  function fail (title, body) {
    errBox.hidden = false;
    errBox.innerHTML = '<b></b>';
    errBox.firstChild.textContent = title;
    errBox.insertAdjacentHTML('beforeend', body);
  }
  const clearFail = () => { errBox.hidden = true; errBox.innerHTML = ''; };

  ack.addEventListener('change', () => {
    loadBtn.disabled = !ack.checked || !!session;
    if (ack.checked && !session) setHint(modelStatus, 'Ready. About 48 MB will be downloaded once, then cached by the browser.');
    else if (!ack.checked) {
      setHint(modelStatus, 'Tick the box above to enable.');
      file.disabled = true;
      setHint(fileHint, 'Load the network first.');
    }
  });

  loadBtn.addEventListener('click', async () => {
    if (session || busy) return;
    clearFail();

    busy = true;
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading…';
    progressWrap.hidden = false;
    setHint(modelStatus, 'Downloading the network. It stays in this tab.');

    try {
      await ensureOrt();
      ort.env.wasm.wasmPaths  = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSION + '/dist/';
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';

      const res = await fetch(MODEL_URL);
      if (!res.ok) {
        throw Object.assign(new Error('http'), { http: res.status });
      }

      const total = Number(res.headers.get('content-length')) || 0;
      const chunks = [];
      let got = 0;

      if (res.body && res.body.getReader) {
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          got += value.length;
          const pct = total ? Math.round(got / total * 100) : 0;
          progressBar.style.width = (total ? pct : 0) + '%';
          progressTxt.textContent = total
            ? pct + '%  ·  ' + (got / 1e6).toFixed(1) + ' of ' + (total / 1e6).toFixed(0) + ' MB'
            : (got / 1e6).toFixed(1) + ' MB';
        }
      } else {
        chunks.push(new Uint8Array(await res.arrayBuffer()));
        got = chunks[0].length;
      }

      const bytes = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) { bytes.set(c, off); off += c.length; }

      progressBar.style.width = '100%';
      progressTxt.textContent = 'Compiling…';

      session = await ort.InferenceSession.create(bytes, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all'
      });

      progressWrap.hidden = true;
      loadBtn.textContent = 'Model loaded';
      setHint(modelStatus,
        'Loaded. Input "' + session.inputNames[0] + '", output "' + session.outputNames[0] + '".', 'ok');
      file.disabled = false;
      setHint(fileHint, 'One isolated cell, please. Non-square images will be squashed to 224×224.');

    } catch (e) {
      progressWrap.hidden = true;
      loadBtn.textContent = 'Try again';
      loadBtn.disabled = false;
      setHint(modelStatus, 'The model did not load.', 'bad');

      if (e && e.message === 'ort-cdn') {
        setHint(modelStatus, 'ONNX Runtime did not load.', 'bad');
        fail('The inference runtime could not be loaded.',
          ' <code>onnxruntime-web@' + ORT_VERSION + '</code> is fetched from jsDelivr. ' +
          'A blocked CDN, an offline connection, or a strict content blocker will stop it. ' +
          'Everything else on this page works without it.');
      } else if (e && e.http === 404) {
        fail('The model file is missing.',
          ' Nothing was found at <code>' + MODEL_URL + '</code> (HTTP 404). ' +
          'The demo needs that file to be present next to this page; every number ' +
          'elsewhere on this page was measured offline and is unaffected.');
      } else if (e && e.http) {
        fail('The model file could not be fetched.',
          ' <code>' + MODEL_URL + '</code> returned HTTP ' + e.http + '.');
      } else if (e instanceof TypeError) {
        fail('The download failed.',
          ' <code>' + MODEL_URL + '</code> could not be reached — most likely a dropped ' +
          'connection, or the page being opened straight from the filesystem rather than ' +
          'served over HTTP.');
      } else {
        fail('The network loaded but would not start.',
          ' ' + (e && e.message ? String(e.message) : 'Unknown error') +
          '. This usually means WebAssembly is unavailable or blocked in this browser.');
      }
    } finally {
      busy = false;
    }
  });

  async function classify (f) {
    if (!f || !session || busy) return;
    clearFail();
    busy = true;
    setHint(fileHint, 'Running…');

    try {
      const img = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(f);
        const im = new Image();
        im.onload  = () => { URL.revokeObjectURL(url); resolve(im); };
        im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image.')); };
        im.src = url;
      });

      const ctx = preview.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(0, 0, 224, 224);
      ctx.drawImage(img, 0, 0, 224, 224);
      const px = ctx.getImageData(0, 0, 224, 224).data;

      /* NHWC float32, channel-last, BGR, mean-subtracted, no 0–1 rescale */
      const input = new Float32Array(224 * 224 * 3);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
        input[j]     = px[i + 2] - MEAN_B;
        input[j + 1] = px[i + 1] - MEAN_G;
        input[j + 2] = px[i]     - MEAN_R;
      }

      const inName  = session.inputNames[0];    /* auto-generated by the export */
      const outName = session.outputNames[0];
      const feeds = {};
      feeds[inName] = new ort.Tensor('float32', input, [1, 224, 224, 3]);

      const out = await session.run(feeds);
      const pNormal   = out[outName].data[0];   /* class index 1 is 'normal' */
      const pLeukemic = 1 - pNormal;

      const flagged = pLeukemic >= THRESHOLD;
      verdict.textContent = flagged ? 'Flagged for review' : 'Not flagged';
      reveal(pLeukemic, flagged);
      setHint(fileHint, 'Done. Pick another to run it again.', 'ok');

    } catch (e) {
      result.hidden = true;
      setHint(fileHint, 'That did not work.', 'bad');
      fail('The image could not be classified.',
        ' ' + (e && e.message ? String(e.message) : 'Unknown error'));
    } finally {
      busy = false;
    }
  }

  file.addEventListener('change', () => classify(file.files && file.files[0]));

  /* ── drag and drop ─────────────────────────────────────────────────────
     A stray drop anywhere else would navigate the tab away, so swallow those. */
  ['dragover', 'drop'].forEach(ev =>
    window.addEventListener(ev, e => { e.preventDefault(); }, false));

  if (dropzone) {
    const over = on => dropzone.classList.toggle('is-dragover', on && !file.disabled);

    ['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = file.disabled ? 'none' : 'copy';
      over(true);
    }));

    ['dragleave', 'dragend'].forEach(ev => dropzone.addEventListener(ev, e => {
      e.preventDefault();
      if (ev === 'dragend' || !dropzone.contains(e.relatedTarget)) over(false);
    }));

    dropzone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      over(false);
      if (file.disabled) return;
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) classify(f);
    });
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   5. Motion — GSAP + ScrollTrigger

   The hidden initial state lives under html.js-anim, and that class is only
   added once GSAP is confirmed up. A blocked CDN, no JS, or reduced motion
   all leave the page fully visible. The disclaimer is never revealed on
   scroll under any of these paths.
   ══════════════════════════════════════════════════════════════════════════ */
(function motion () {
  const intro  = document.getElementById('intro');
  const introN = document.getElementById('introN');
  const ready  = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  /* ── accordion: opening is pure CSS; closing needs the panel to finish
        collapsing before `open` is removed, or it snaps shut ────────────── */
  document.querySelectorAll('.faq details').forEach(d => {
    const sum  = d.querySelector('summary');
    const wrap = d.querySelector('.faq__wrap');
    if (!sum || !wrap) return;
    sum.addEventListener('click', e => {
      if (!d.open) return;                       /* opening — let CSS handle it */
      e.preventDefault();
      wrap.style.gridTemplateRows = '0fr';
      const wait = REDUCED ? 0 : 320;
      setTimeout(() => { d.open = false; wrap.style.gridTemplateRows = ''; }, wait);
    });
  });

  if (!ready) { if (intro) intro.remove(); return; }
  gsap.registerPlugin(ScrollTrigger);

  /* Split each masked line into words so they can stagger inside the clip. */
  document.querySelectorAll('.mask > span').forEach(line => {
    const words = line.textContent.split(/\s+/).filter(Boolean);
    line.textContent = '';
    words.forEach((w, i) => {
      const el = document.createElement('span');
      el.className = 'w';
      el.textContent = w + (i < words.length - 1 ? '\u00A0' : '');
      line.appendChild(el);
    });
  });

  if (REDUCED) {
    document.documentElement.classList.add('js-anim');   /* CSS forces all visible */
    if (intro) intro.remove();
    document.querySelectorAll('[data-count]').forEach(el => {
      const dp = +el.dataset.dp || 0, v = parseFloat(el.dataset.count);
      el.textContent = dp ? v.toFixed(dp) : Math.round(v).toLocaleString('en-US');
    });
    return;
  }

  document.documentElement.classList.add('js-anim');
  const words = gsap.utils.toArray('.mask .w');
  gsap.set('.mask > span', { y: 0 });
  gsap.set(words, { yPercent: 105 });
  gsap.set('[data-reveal]', { y: 24 });

  const raise = (scope, delay) => gsap.to(scope.querySelectorAll('.w'), {
    yPercent: 0, duration: .8, ease: 'power3.out', stagger: .045, delay: delay || 0
  });

  /* ── page-load intro: percentage counter, then a wipe. ~1.35s total ───── */
  function start () {
    const hero = document.querySelector('.hero h1');
    if (hero) raise(hero, .05);
    gsap.to('.hero [data-reveal]', {
      opacity: 1, y: 0, duration: .7, ease: 'power2.out', stagger: .09, delay: .35
    });
  }

  if (intro && introN) {
    const n = { v: 0 };
    gsap.timeline()
      .to(n, { v: 100, duration: .9, ease: 'power2.inOut',
               onUpdate () { introN.textContent = Math.round(n.v); } })
      .to(intro, { yPercent: -100, duration: .45, ease: 'power3.inOut',
                   onComplete () { intro.remove(); } }, '-=.04')
      .add(start, '-=.30');
  } else {
    start();
  }

  /* ── headlines below the fold ─────────────────────────────────────────── */
  gsap.utils.toArray('h2').forEach(h => {
    if (!h.querySelector('.w') || h.closest('.hero')) return;
    ScrollTrigger.create({ trigger: h, start: 'top 86%', once: true,
                           onEnter: () => raise(h) });
  });

  /* ── section content: fade plus a short rise, staggered ───────────────── */
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    onEnter: batch => gsap.to(batch, {
      opacity: 1, y: 0, duration: .65, ease: 'power2.out', stagger: .09, overwrite: true
    })
  });

  /* ── statistics count up as they arrive ───────────────────────────────── */
  gsap.utils.toArray('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count), dp = +el.dataset.dp || 0;
    const fmt = v => dp ? v.toFixed(dp) : Math.round(v).toLocaleString('en-US');
    el.textContent = fmt(0);
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: () => gsap.to(o, {
        v: target, duration: 1.1, ease: 'power2.out',
        onUpdate () { el.textContent = fmt(o.v); },
        onComplete () { el.textContent = fmt(target); }
      })
    });
  });

  /* ── parallax on the full-bleed band ──────────────────────────────────── */
  const fig = document.getElementById('bleedFig');
  if (fig) gsap.to(fig, {
    yPercent: -7, ease: 'none',
    scrollTrigger: { trigger: '.bleed', start: 'top bottom', end: 'bottom top', scrub: .6 }
  });

  /* the cell field is drawn on a canvas that only sizes correctly once its
     container has settled */
  ScrollTrigger.addEventListener('refreshInit', () => window.dispatchEvent(new Event('resize')));
})();
