/* ============================================================================
   Leukemic lymphoblast screening aid

   Three drawings and one demo:
     1. the field of 1,882 test cells
     2. the ROC curve (points traced from the project's own plot, roc-data.js)
     3. a schematic of the two ways to split the dataset
     4. the model, run client-side with onnxruntime-web
   ========================================================================= */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;


const THRESHOLD = 0.770;

/* ══════════════════════════════════════════════════════════════════════════
   Figures are loaded on first activation of the panel that owns them.
   ══════════════════════════════════════════════════════════════════════════ */
(function figureLoader () {
  let mod = null;
  const load = () => (mod || (mod = import('./figures.js')));

  /* One frame after the panel is displayed, so the canvas measures a laid-out
     parent rather than a zero-width one. */
  const afterLayout = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

  async function mount (id) {
    /* decide before loading: Overview and Demo have no figures, so they must
       not pull the module in at all */
    if (id !== 'results' && id !== 'method') return;
    try {
      const f = await load();
      if (id === 'results') afterLayout(() => { f.mountCellField(); f.mountRoc(THRESHOLD); });
      else afterLayout(() => f.mountSplit());
    } catch (e) {
      /* figures are enhancement; the tables carry the same numbers */
    }
  }

  document.addEventListener('panel:show', e => mount(e.detail && e.detail.id));

  /* tabs.js runs before this file and has already shown a panel, so its
     panel:show for the initial tab fired before the listener above existed.
     Catch up with whatever is on screen now. */
  document.querySelectorAll('.panel:not([hidden])').forEach(
    p => mount(p.id.replace(/^panel-/, '')));

  /* If the tab layer never ran, every panel is visible, so mount everything. */
  addEventListener('DOMContentLoaded', () => {
    if (!document.documentElement.classList.contains('js-tabs')) {
      load().then(f => afterLayout(() => {
        f.mountCellField(); f.mountRoc(THRESHOLD); f.mountSplit();
      })).catch(() => {});
    }
  });
})();

/* ══════════════════════════════════════════════════════════════════════════
   4. The demo — the model runs here, in this tab, on your machine
   ══════════════════════════════════════════════════════════════════════════ */
(function demo () {
  const MODEL_URL   = 'models/model.onnx';
  const ORT_VERSION = '1.20.1';
  const ORT_SRC     = 'vendor/ort/ort.wasm.min.js';
  /* Must be an absolute URL: ORT dynamically import()s the .mjs loader from
     here, and a bare relative path is not a valid module specifier. Derived
     from baseURI so it also resolves under a GitHub Pages subpath. */
  const ORT_WASM    = new URL('vendor/ort/', document.baseURI).href;
  /* Bump when the weights change; older caches are deleted on load. */
  const CACHE_NAME  = 'alln-weights-v1';
  const MODEL_BYTES = 47693953;
  /* Caffe-style ResNet-50 preprocessing: BGR, mean-subtracted, NOT rescaled. */
  const MEAN_B = 103.939, MEAN_G = 116.779, MEAN_R = 123.68;

  /* The runtime is served from this origin and is not fetched until the
     visitor asks for the model, or hovers the Demo tab. */
  let ortPromise = null;
  function ensureOrt () {
    if (typeof ort !== 'undefined') return Promise.resolve();
    if (ortPromise) return ortPromise;
    ortPromise = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = ORT_SRC;
      el.onload  = () => res();
      el.onerror = () => { ortPromise = null; rej(new Error('ort-cdn')); };
      document.head.appendChild(el);
    });
    return ortPromise;
  }
  window.__ensureOrt = ensureOrt;   /* the Demo tab prefetches the runtime only */

  /* Drop caches from earlier weight versions so an old copy cannot linger. */
  if (window.caches && caches.keys) {
    caches.keys().then(ks => ks.forEach(k => {
      if (/^alln-weights-/.test(k) && k !== CACHE_NAME) caches.delete(k);
    })).catch(() => {});
  }

  function connectionWarning () {
    const c = navigator.connection;
    if (!c) return null;
    if (c.saveData) return 'Data Saver is on.';
    if (/^(slow-2g|2g|3g)$/.test(c.effectiveType || '')) {
      return 'This looks like a ' + c.effectiveType + ' connection.';
    }
    return null;
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
    if (ack.checked && !session) {
      const warn = connectionWarning();
      setHint(modelStatus, warn
        ? warn + ' Loading the network means downloading about 48 MB.'
        : 'Ready. About 48 MB will be downloaded once, then cached by the browser.',
        warn ? 'bad' : '');
    }
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
      ort.env.wasm.wasmPaths  = ORT_WASM;
      ort.env.wasm.numThreads = 1;
      ort.env.logLevel = 'error';

      /* A complete, verified copy may already be cached from a previous
         visit; a partial one is never written, so anything here is whole. */
      let cache = null, cached = null;
      try {
        if (window.caches) {
          cache = await caches.open(CACHE_NAME);
          cached = await cache.match(MODEL_URL);
        }
      } catch (e) { cache = null; }

      const res = cached || await fetch(MODEL_URL);
      if (!res.ok) {
        throw Object.assign(new Error('http'), { http: res.status });
      }
      if (cached) {
        setHint(modelStatus, 'Loading the network from this browser\u2019s cache.');
        progressBar.style.width = '100%';
        progressTxt.textContent = 'from cache';
      }

      const total = Number(res.headers.get('content-length')) || 0;
      const chunks = [];
      let got = 0;

      if (!cached && res.body && res.body.getReader) {
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

      /* Never cache a short read: a truncated model is worse than none. */
      if (!cached && cache && got === MODEL_BYTES) {
        try {
          await cache.put(MODEL_URL, new Response(bytes, {
            headers: { 'Content-Type': 'application/octet-stream',
                       'Content-Length': String(got) }
          }));
        } catch (e) {
          /* QuotaExceededError, or private browsing with no storage: the demo
             still works, it just downloads again next time. */
        }
      }

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

  const wired = new Set();
  function wire (root) {
    if (!root || wired.has(root)) return;
    wired.add(root);
    root.querySelectorAll('[data-reveal]').forEach(e => revealIO.observe(e));
    root.querySelectorAll('.mask').forEach(e => maskIO.observe(e));
    root.querySelectorAll('[data-count]').forEach(e => { reserve(e); countIO.observe(e); });
  }

  /* hero and footer sit outside the tab system */
  document.querySelectorAll('.hero, .cta').forEach(wire);

  document.addEventListener('panel:show', e => {
    wire(document.getElementById('panel-' + (e.detail && e.detail.id)));
  });

  /* tabs.js activated a panel before this file ran, so catch up */
  document.querySelectorAll('.panel:not([hidden])').forEach(wire);

  if (!document.documentElement.classList.contains('js-tabs')) {
    document.querySelectorAll('.panel').forEach(wire);
  }
})();
