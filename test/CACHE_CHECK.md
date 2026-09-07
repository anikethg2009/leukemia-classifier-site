# Cache Storage: manual verification

The weights are cached in Cache Storage under a versioned key so a repeat
visitor does not download 47.7 MB again. **This has not been verified
automatically.** Cache Storage is broken in headless Chrome on this machine:
`InvalidAccessError: Entry already exists` on an ephemeral profile and
`UnknownError` on `caches.open()` with a persistent `--user-data-dir`, while
localStorage and IndexedDB work in the same session.

So the four checks below need a real browser. Two of the four already have
evidence; the other two do not.

| | Status |
|---|---|
| Falls back when the cache is unavailable | **verified by accident** -- every headless run has the cache failing, and the demo still returns 0.813 with the weights re-fetched |
| No off-origin requests in any cache state | **verified** -- four states, zero off-origin |
| Model actually caches, and is served from cache | **not verified** |
| Version key evicts the previous version | **not verified** |

Relevant constants in `app.js`:

```js
const CACHE_NAME  = 'alln-weights-v1';
const MODEL_BYTES = 47693953;
```

## Setup

Serve the repo root, open the page in a normal (non-headless) browser, and
open DevTools. Use a fresh profile or clear site data first:
Application > Storage > Clear site data.

## 1. It caches after the first load

1. Network tab, "Disable cache" **off**.
2. Demo tab, tick the acknowledgement, click Load model.
3. Watch `models/model.onnx` download -- expect 47,693,953 bytes.
4. Application > Cache Storage. Expect a cache named **`alln-weights-v1`**
   containing an entry for `models/model.onnx`.

Pass: the entry exists and its size matches.

## 2. A second load serves it from cache, with no network fetch

1. Reload the page. Do **not** clear site data.
2. Filter the Network tab to `model.onnx`.
3. Tick the acknowledgement, click Load model.

Pass: **no network request for `model.onnx` appears at all.** A request shown
as "(from disk cache)" is the HTTP cache, not Cache Storage -- that is a
different mechanism and does not count. To be sure it is Cache Storage, tick
"Disable cache" in the Network tab and repeat: the HTTP cache is then bypassed
but the model should still load without a network request.

Load should be noticeably faster, and the demo should still score
**0.813** on `test/cell_a.png`.

## 3. The version key evicts the old version

1. With a cache populated, edit `CACHE_NAME` in `app.js` to
   `alln-weights-v2`.
2. Hard-reload, then load the model again.

Pass: Application > Cache Storage lists **only `alln-weights-v2`**.
`alln-weights-v1` should be gone, not sitting alongside it -- otherwise every
version bump leaves another 47.7 MB on the visitor's disk.

Set `CACHE_NAME` back to `alln-weights-v1` afterwards.

## 4. A full quota falls back to a plain fetch

Force the failure rather than filling the disk. In the console, before
loading the model:

```js
caches.open = () => Promise.reject(
  new DOMException('simulated', 'QuotaExceededError'));
```

Then tick the acknowledgement and load the model.

Pass: the model still loads over the network, the demo still scores
**0.813**, and there are **no uncaught errors in the console**. A caching
failure must degrade to a plain fetch, never break the demo.

## If any of these fail

The caching path is an optimisation, not a correctness requirement -- the demo
works without it. Prefer disabling the cache over shipping a half-working one:
a stale cached model that never updates is worse than a 47.7 MB download,
because the score on screen would no longer come from the model in the repo.
