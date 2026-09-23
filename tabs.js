/* ============================================================================
   Tabs — WAI-ARIA tabs pattern over the four panels, plus hash routing.

   Progressive enhancement: the panels are plain sections in the document and
   every one of them renders if this file never runs. The tablist ships with
   the `hidden` attribute and is only revealed here, so a no-JS visitor gets
   the full long-scroll document rather than a dead row of buttons.
   ========================================================================= */
(function tabs () {
  'use strict';

  const bar = document.getElementById('tabs');
  const announce = document.getElementById('tabAnnounce');
  if (!bar) return;

  const tabEls = [].slice.call(bar.querySelectorAll('[role="tab"]'));
  if (!tabEls.length) return;

  const IDS = tabEls.map(t => t.dataset.tab);
  const panelOf = id => document.getElementById('panel-' + id);
  const tabOf   = id => document.getElementById('tab-' + id);

  /* Which panel owns an arbitrary in-page anchor, so #background can activate
     Overview and #tradeoff can activate Results. */
  function ownerOf (hash) {
    if (!hash) return null;
    if (IDS.indexOf(hash) !== -1) return hash;
    const el = document.getElementById(hash);
    if (!el) return null;
    const panel = el.closest('.panel');
    return panel ? panel.id.replace(/^panel-/, '') : null;
  }

  let current = null;

  /* Panels that have never been shown get one activation event, so figure and
     demo code can be loaded and drawn on demand rather than on boot. */
  const seen = Object.create(null);

  function show (id, opts) {
    opts = opts || {};
    if (IDS.indexOf(id) === -1) id = IDS[0];

    tabEls.forEach(t => {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = panelOf(t.dataset.tab);
      if (p) p.hidden = !on;
    });

    const panel = panelOf(id);
    const changed = current !== id;
    current = id;
    /* keeps the CSS gate from the head script in step with the active tab */
    document.documentElement.setAttribute('data-tab', id);

    if (opts.focusTab) tabOf(id).focus();

    if (changed && panel) {
      /* Anything laid out while the panel was display:none has zero width, so
         let listeners re-measure now that it is on screen. */
      window.dispatchEvent(new Event('resize'));
      panel.dispatchEvent(new CustomEvent('panel:show', {
        bubbles: true, detail: { id: id, first: !seen[id] }
      }));
      seen[id] = true;

      if (opts.focusPanel) panel.focus({ preventScroll: true });
      if (announce) {
        announce.textContent = tabOf(id).textContent.trim() + ' panel';
      }
    }
    return changed;
  }

  /* ── routing ────────────────────────────────────────────────────────────
     A tab hash is pushed with pushState so the browser does not try to scroll
     to an element that does not exist; the back button still moves between
     tabs because each activation adds an entry. */
  function syncFromHash (opts) {
    opts = opts || {};
    const raw = (location.hash || '').replace(/^#/, '');
    const owner = ownerOf(raw);
    show(owner || IDS[0], opts);
    if (owner && IDS.indexOf(raw) === -1) scrollTo(raw, false);
    /* A bare tab hash (#demo) names no element, so the browser has nothing to
       scroll to and a deep link would open on the hero with the panel out of
       sight. On arrival, take the visitor to the panel they asked for. */
    else if (opts.arrival && owner && raw) scrollTo(firstSection(owner), false);
  }

  /* The heading a panel opens with: where a link to the bare tab should land. */
  function firstSection (id) {
    const s = panelOf(id) && panelOf(id).querySelector('section[id]');
    return s ? s.id : null;
  }

  /* Scrolling has to happen after the panel is displayed and laid out, or the
     target is still in a display:none subtree and scrollIntoView is a no-op
     that silently leaves you at the top. */
  function scrollTo (id, focusIt) {
    const el = document.getElementById(id);
    if (!el) return;
    requestAnimationFrame(() => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      pin(el);
      if (focusIt) {
        /* Following an anchor should land focus on the thing you asked for,
           not on the panel that happens to contain it. */
        if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
        el.focus({ preventScroll: true });
      }
    });
  }

  /* The figures in a panel mount asynchronously after it is shown (figures.js
     is imported on demand), and each one grows the panel above anything that
     follows it: #tradeoff and #sec-method both landed hundreds of pixels off
     their heading. Hold the target in place while the panel settles, and let
     go the moment the visitor scrolls for themselves. */
  function pin (el) {
    const panel = el.closest('.panel');
    if (!panel || typeof ResizeObserver !== 'function') return;
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
    ro.observe(panel);
    EV.forEach(t => window.addEventListener(t, stop, { passive: true }));
    setTimeout(stop, 1500);
  }

  /* Tab activation focuses the panel. Anchor navigation focuses the target
     section instead, so "Read the background" leaves you at that heading. */
  function go (id, anchor) {
    const hash = '#' + (anchor || id);
    if (location.hash !== hash) history.pushState(null, '', hash);
    show(id, { focusPanel: !anchor });
    if (anchor) scrollTo(anchor, true);
    else requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }

  /* ── interaction ────────────────────────────────────────────────────── */
  bar.addEventListener('click', e => {
    const t = e.target.closest('[role="tab"]');
    if (t) { e.preventDefault(); go(t.dataset.tab); tabOf(t.dataset.tab).focus(); }
  });

  bar.addEventListener('keydown', e => {
    const t = e.target.closest('[role="tab"]');
    if (!t) return;
    const i = IDS.indexOf(t.dataset.tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % IDS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + IDS.length) % IDS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = IDS.length - 1;
    else return;
    e.preventDefault();
    go(IDS[n]);
    tabOf(IDS[n]).focus();
  });

  /* In-page links keep working: activate the owning tab, then scroll.
     A link to a bare tab id (#demo) used to take the tab-button path, which
     scrolls to the top of the page — so from the hero it switched the panel
     below the fold and left the visitor where they were. Content links always
     scroll to a heading instead: the named one, or the panel's first. */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.closest('[role="tablist"]')) return;
    const raw = a.getAttribute('href').slice(1);
    if (!raw) return;
    const owner = ownerOf(raw);
    if (!owner) return;                       /* #main and friends: leave alone */
    e.preventDefault();
    go(owner, IDS.indexOf(raw) === -1 ? raw : firstSection(owner));
  });

  window.addEventListener('popstate', () => syncFromHash());
  window.addEventListener('hashchange', () => syncFromHash());

  /* Printing should produce the whole document, not one panel. */
  const expandAll = () => tabEls.forEach(t => { const p = panelOf(t.dataset.tab); if (p) p.hidden = false; });
  const restore   = () => show(current, {});
  if (window.matchMedia) {
    const mq = window.matchMedia('print');
    const onPrint = m => (m.matches ? expandAll() : restore());
    if (mq.addEventListener) mq.addEventListener('change', e => onPrint(e));
  }
  window.addEventListener('beforeprint', expandAll);
  window.addEventListener('afterprint', restore);

  /* js-tabs and data-tab are already set by the head script, before first
     paint; this only takes over the running state. */
  syncFromHash({ arrival: true });

  /* Hovering or focusing the Demo tab warms the runtime only. The 47.7 MB
     of weights are never touched here; they wait for the gate. */
  const demoTab = tabOf('demo');
  if (demoTab) {
    let warmed = false;
    const warm = () => {
      if (warmed) return;
      warmed = true;
      if (typeof window.__ensureOrt === 'function') window.__ensureOrt().catch(() => {});
    };
    demoTab.addEventListener('pointerenter', warm, { once: true });
    demoTab.addEventListener('focus', warm, { once: true });
  }

  window.siteTabs = { show: show, go: go, current: () => current, ids: IDS };
})();
