/* ============================================================================
   demo.js — the model, run client-side with onnxruntime-web.

   Moved out of app.js unchanged when the site split into two pages. The
   preprocessing path (BGR order, Caffe mean subtraction, no rescale, the
   1 - output mapping, THRESHOLD) is byte-identical to what it was in app.js;
   see test/REGRESSION.md.
   ========================================================================= */
/* Each script here is a classic script, and classic scripts share one global
   scope, so every file keeps its constants inside its own block. */
{
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const THRESHOLD = 0.770;

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
     visitor asks for the model, or hovers the Demo link in the nav. */
  let ortPromise = null;
  function ensureOrt () {
    if (typeof ort !== 'undefined') return Promise.resolve();
    if (ortPromise) return ortPromise;
    ortPromise = new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = ORT_SRC;
      el.onload  = () => res();
      el.onerror = () => { ortPromise = null; rej(new Error('ort-load')); };
      document.head.appendChild(el);
    });
    return ortPromise;
  }
  window.__ensureOrt = ensureOrt;   /* the Demo nav link prefetches the runtime only */

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

      if (e && e.message === 'ort-load') {
        setHint(modelStatus, 'ONNX Runtime did not load.', 'bad');
        fail('The inference runtime could not be loaded.',
          ' <code>onnxruntime-web@' + ORT_VERSION + '</code> is served from this site, at ' +
          '<code>' + ORT_SRC + '</code>. A dropped connection, a missing file, or a strict ' +
          'content blocker will stop it. Everything else on this page works without it.');
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
}
