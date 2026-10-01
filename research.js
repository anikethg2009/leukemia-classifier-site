/* ============================================================================
   research.js — the research page: the compact cell field at the top of
   Results, and the three figures in figures.js.
   ========================================================================= */
/* Each script here is a classic script, and classic scripts share one global
   scope, so every file keeps its constants inside its own block. */
{
const THRESHOLD = 0.770;

/* ══════════════════════════════════════════════════════════════════════════
   Figures. Every figure is mounted as soon as the module arrives. figures.js
   is 21 KB, and it is only ever loaded on this page.
   ══════════════════════════════════════════════════════════════════════════ */
(function figureLoader () {
  /* One frame after layout, so each canvas measures a laid-out parent. */
  const afterLayout = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

  /* Mounting grows the page above anything that follows a figure, so a deep
     link that the browser has already scrolled to (#validation, #limits)
     would be pushed off its heading. Hold the target in place while the
     figures settle, and let go the moment the visitor scrolls themselves. */
  function holdArrival () {
    const id = decodeURIComponent((location.hash || '').slice(1));
    const el = id && document.getElementById(id);
    if (!el || typeof ResizeObserver !== 'function') return;
    let done = false, first = true;
    const EV = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    const stop = () => {
      if (done) return;
      done = true; ro.disconnect();
      EV.forEach(t => window.removeEventListener(t, stop));
    };
    const ro = new ResizeObserver(() => {
      if (first) { first = false; return; }   /* the observe() call itself */
      if (!done) el.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    ro.observe(document.body);
    EV.forEach(t => window.addEventListener(t, stop, { passive: true }));
    setTimeout(stop, 1500);
  }
  holdArrival();

  const mountAll = () => import('./figures.js').then(f => afterLayout(() => {
    f.mountCellField(); f.mountRoc(THRESHOLD); f.mountSplit();
  })).catch(() => { /* figures are enhancement; the tables carry the same numbers */ });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();

/* ══════════════════════════════════════════════════════════════════════════
   The compact cell field at the top of Results: a picture of the test set, not of any
   one outcome. Leukemic cells above, normal below, as in the full field, but
   within each block the outcomes are interspersed by a fixed-seed shuffle,
   so no group forms a band and the drawing is identical on every load. The
   full field in figures.js keeps its grouped order, where the misses read as
   a block. Counts are the ones in the specimen label and the matrix.
   ══════════════════════════════════════════════════════════════════════════ */
(function miniField () {
  const cv = document.getElementById('minifield');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const N = { tp: 851, fn: 243, fp: 36, tn: 752 };
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* one fixed order per block, computed once */
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const block = (a, na, b, nb) => {
    const out = Array(na).fill(a).concat(Array(nb).fill(b));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const LEUK = block('tp', N.tp, 'fn', N.fn);
  const NORM = block('fp', N.fp, 'tn', N.tn);

  function draw () {
    const W = cv.parentElement.clientWidth;
    if (!W) return;
    const cols = Math.max(48, Math.min(96, Math.floor(W / 5.5)));
    const p = W / cols, r = Math.max(1.1, p * 0.34), gap = Math.round(p * 1.6);
    const rowsA = Math.ceil((N.tp + N.fn) / cols), rowsB = Math.ceil((N.fp + N.tn) / cols);
    const H = Math.ceil((rowsA + rowsB) * p + gap);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const col = { tp: css('--violet'), fn: css('--rose'), fp: css('--steel'), tn: css('--ink-faint') };
    const dot = (i, y0, g) => {
      const x = (i % cols) * p + p / 2, y = y0 + Math.floor(i / cols) * p + p / 2;
      ctx.beginPath();
      if (g === 'fp') {
        ctx.arc(x, y, Math.max(0.9, r - 0.35), 0, 6.2832);
        ctx.lineWidth = Math.max(0.9, r * 0.55); ctx.strokeStyle = col.fp; ctx.stroke();
      } else {
        ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = col[g]; ctx.fill();
      }
    };
    LEUK.forEach((g, i) => dot(i, 0, g));
    const yB = rowsA * p + gap;
    NORM.forEach((g, j) => dot(j, yB, g));
  }

  draw();
  /* the web fonts can move the column width once they land */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  let rAF;
  window.addEventListener('resize', () => { cancelAnimationFrame(rAF); rAF = requestAnimationFrame(draw); });
})();
}
