/* ============================================================================
   site.js — shared by both pages: the limits accordion, headline masks,
   scroll reveals and number counters.
   ========================================================================= */
/* Each script here is a classic script, and classic scripts share one global
   scope, so every file keeps its constants inside its own block. */
{
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══════════════════════════════════════════════════════════════════════════
   5. Motion — IntersectionObserver driving CSS transitions.

   This replaced GSAP + ScrollTrigger, which cost ~956 ms of main-thread
   blocking on a throttled mobile load (gsap core itself was only ~17 ms; the
   expense was ScrollTrigger building and measuring triggers). The reveal and
   mask thresholds below are the ones ScrollTrigger used, so the page reads
   the same. Parallax on the full-bleed band is gone, and so is the load
   intro: the anti-flash job it was quietly doing now belongs to the
   synchronous head script, which is the honest place for it.
   ══════════════════════════════════════════════════════════════════════════ */
(function motion () {
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

  /* Split each masked line into words so they can stagger inside the clip. */
  document.querySelectorAll('.mask > span').forEach(line => {
    if (line.querySelector('.w')) return;
    const words = line.textContent.split(/\s+/).filter(Boolean);
    line.textContent = '';
    words.forEach((w, i) => {
      const el = document.createElement('span');
      el.className = 'w';
      el.textContent = w + (i < words.length - 1 ? '\u00A0' : '');
      line.appendChild(el);
    });
  });

  const fmt = (el, v) => {
    const dp = +el.dataset.dp || 0;
    return dp ? v.toFixed(dp) : Math.round(v).toLocaleString('en-US');
  };

  /* Reserve the width of the final value before counting starts, so the
     digits cannot reflow the line on their way up. */
  function reserve (el) {
    const target = parseFloat(el.dataset.count);
    el.textContent = fmt(el, target);
    const w = el.getBoundingClientRect().width;
    if (w) el.style.minWidth = w.toFixed(2) + 'px';
    return target;
  }

  document.documentElement.classList.add('js-anim');

  if (REDUCED) {
    /* CSS already forces everything visible; just land the counters. */
    document.querySelectorAll('[data-count]').forEach(reserve);
    return;
  }

  function countUp (el) {
    const target = parseFloat(el.dataset.count);
    el.textContent = fmt(el, 0);
    const t0 = performance.now(), dur = 1100;
    (function step (now) {
      const t = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(el, target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = fmt(el, target);
    })(t0);
  }

  /* rootMargin mirrors ScrollTrigger's "top NN%" start positions */
  const watch = (margin, onHit) => new IntersectionObserver((entries, obs) => {
    const hits = entries.filter(e => e.isIntersecting);
    if (hits.length) onHit(hits, obs);
  }, { rootMargin: margin, threshold: 0 });

  const revealIO = watch('0px 0px -10% 0px', (hits, obs) => {
    hits.forEach((e, i) => {
      e.target.style.transitionDelay = (i * 90) + 'ms';
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    });
  });

  const maskIO = watch('0px 0px -14% 0px', (hits, obs) => {
    hits.forEach(e => {
      e.target.querySelectorAll('.w').forEach((w, i) => {
        w.style.transitionDelay = (i * 45) + 'ms';
      });
      e.target.classList.add('is-in');
      obs.unobserve(e.target);
    });
  });

  const countIO = watch('0px 0px -12% 0px', (hits, obs) => {
    hits.forEach(e => { countUp(e.target); obs.unobserve(e.target); });
  });

  /* one document, wired once; the cover and footer are no longer special */
  document.querySelectorAll('[data-reveal]').forEach(e => revealIO.observe(e));
  document.querySelectorAll('.mask').forEach(e => maskIO.observe(e));
  document.querySelectorAll('[data-count]').forEach(e => { reserve(e); countIO.observe(e); });
})();
}
