/* ============================================================================
   Nav — the persistent bar at the top of the document.

   Replaces the tab shell. The page is one continuous document again; this
   file only does three things:
     1. the mobile menu, as a disclosure (button + aria-expanded), not a modal
     2. marks the section being read with aria-current="location"
     3. warms the inference runtime when the visitor heads for the demo

   Anchor links are plain links. The landing offset is html's
   scroll-padding-top in style.css, which reads the same --nav-h the bar is
   drawn at, so there is no scroll arithmetic here to drift out of step.
   ========================================================================= */
(function nav () {
  'use strict';

  const bar = document.getElementById('nav');
  const btn = document.getElementById('navToggle');
  const list = document.getElementById('navList');
  if (!bar || !btn || !list) return;

  const links = [].slice.call(list.querySelectorAll('a[href^="#"]'));

  /* ── 1. mobile menu ─────────────────────────────────────────────────── */
  btn.hidden = false;                     /* only usable once this has run */
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';

  function setOpen (on, returnFocus) {
    btn.setAttribute('aria-expanded', String(on));
    bar.classList.toggle('is-open', on);
    if (!on && returnFocus) btn.focus();
  }

  btn.addEventListener('click', () => setOpen(!isOpen()));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });

  /* choosing a section closes the menu, then the link does its job */
  list.addEventListener('click', e => { if (e.target.closest('a')) setOpen(false); });

  /* a tap anywhere else, or focus leaving the bar, closes it too */
  document.addEventListener('click', e => { if (isOpen() && !bar.contains(e.target)) setOpen(false); });
  bar.addEventListener('focusout', e => {
    if (isOpen() && e.relatedTarget && !bar.contains(e.relatedTarget)) setOpen(false);
  });

  /* widening past the breakpoint with the menu open would leave it stuck */
  const narrow = window.matchMedia('(max-width: 899.98px)');
  const onWidth = () => { if (!narrow.matches) setOpen(false); };
  if (narrow.addEventListener) narrow.addEventListener('change', onWidth);
  else if (narrow.addListener) narrow.addListener(onWidth);

  /* ── 2. current section ─────────────────────────────────────────────────
     A section is current while it crosses a reading line a third of the way
     down the viewport, below the bar. Measured on scroll rather than with an
     IntersectionObserver, because the answer has to be exactly one section
     or none (the cover, the credits), and that is simplest to read off
     positions directly. One rAF per frame at most. */
  const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  let currentIx = -2;

  function navH () { return bar.getBoundingClientRect().height; }

  function update () {
    const line = navH() + (window.innerHeight - navH()) / 3;
    let ix = -1;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t) continue;
      const r = t.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) { ix = i; break; }
    }
    if (ix === currentIx) return;
    currentIx = ix;
    links.forEach((a, i) => {
      if (i === ix) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  /* figures mount after load and change section heights */
  if (typeof ResizeObserver === 'function') new ResizeObserver(queue).observe(document.body);
  update();

  /* ── 3. demo warm-up ────────────────────────────────────────────────────
     Hovering or focusing the Demo link fetches the runtime only. The 47.7 MB
     of weights are never touched here; they wait for the gate. */
  const demoLink = links.find(a => a.getAttribute('href') === '#demo');
  if (demoLink) {
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      if (typeof window.__ensureOrt === 'function') window.__ensureOrt().catch(() => {});
    };
    demoLink.addEventListener('pointerenter', warm, { once: true });
    demoLink.addEventListener('focus', warm, { once: true });
  }
})();
