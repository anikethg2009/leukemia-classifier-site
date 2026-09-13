# Deploying to GitHub Pages

The site is plain static files with no build step. Pages serves the repository
root exactly as committed, which is why every asset path is relative and why
there is no `_site`, no bundler, and nothing to compile.

| | |
|---|---|
| Repository | `anikethg2009/leukemia-classifier-site` — **public** |
| Branch to serve | `main` |
| Folder | **`/ (root)`** |
| Live URL | `https://anikethg2009.github.io/leukemia-classifier-site/` |

`.nojekyll` is committed at the root. Keep it. Without it Pages runs the files
through Jekyll, which silently drops paths beginning with `_` and adds build
time for nothing.

---

## 1. The first push

The remote is **public and completely empty** — created, never pushed to. The
first push publishes all history at once and cannot be undone, so run these in
order rather than improvising.

Push `main` **first**. GitHub makes the first branch it receives the
repository's default branch, and the default is what Pages offers, what clones
land on, and what visitors see first.

```sh
git checkout main
git push -u origin main
git push -u origin tabs-and-perf     # optional, only to keep the branch history
```

### Do not use `--mirror`

```sh
git push --mirror origin     # ← never run this here
```

Fourteen commit messages were rewritten to strip `Claude-Session:` session-ID
lines. `git filter-branch` preserved the originals under `refs/original/`, and
those refs were deleted afterwards — but **`--mirror` pushes every ref under
`refs/*`**, not just branches, so if any backup ref is ever recreated (running
`filter-branch` again does exactly that) a mirror push would republish the
messages the rewrite removed. `git push origin main` and `git push --all` both
push only `refs/heads/*` and are safe.

The pre-rewrite commits also remain in the local reflog for the usual 90 days.
Reflog entries are never pushed, so they are a local safety net only.

---

## 2. Enabling Pages

1. **Settings → Pages**
2. **Source:** `Deploy from a branch`
3. **Branch:** `main`, **Folder:** `/ (root)` → **Save**
4. Leave **Enforce HTTPS** ticked. It is on by default for `*.github.io` and
   there is no reason to turn it off.

Pages cannot be enabled before the first push — with no branches, the branch
dropdown is empty.

### What to expect on the first build

- A **`pages build and deployment`** run appears under the **Actions** tab.
  This is GitHub's own workflow; there is no workflow file in this repo and
  none needs to be added.
- The first build usually finishes in **1–3 minutes**. It is slower than later
  builds because the whole tree, including the 45.5 MiB model, is uploaded as
  the deployment artifact.
- **A 404 for the first couple of minutes after the build reports success is
  normal.** The URL takes a moment to start resolving. Wait two minutes before
  concluding anything is wrong.
- No DNS step and no certificate step. Both are automatic on `github.io`.

---

## 3. Verifying on the live URL

Everything below must be run against **`https://`**, not localhost. These
checks exist because the site passing locally proves almost nothing about
Pages: different origin, different server, different headers, real TLS, and a
CDN in front of it.

Set this once so the commands can be pasted as-is:

```sh
SITE=https://anikethg2009.github.io/leukemia-classifier-site
```

### 3.1 The model actually serves, whole, over HTTPS

**This is the check most likely to fail**, and the one that silently breaks
the demo when it does. 45.5 MiB through a CDN is where a truncated transfer, a
redirect to an HTML error page, or a Git LFS pointer would surface.

```sh
curl -sSL -o /dev/null \
  -w 'status %{http_code}  bytes %{size_download}  type %{content_type}\n' \
  "$SITE/models/model.onnx"
```

Expect exactly:

```
status 200  bytes 47693953  type application/octet-stream
```

`bytes` must be **47693953**. Anything smaller is a truncated or intercepted
response. A few hundred bytes means you are looking at an error page or an LFS
pointer rather than the model — this repo uses no LFS, and it must stay that
way, because Pages serves LFS pointer *files*, not the objects behind them.

Then confirm the bytes are the right bytes, not merely the right number of
them:

```sh
curl -sSL "$SITE/models/model.onnx" | sha256sum
```

Expect:

```
c36dcf808d71927ee0981d7104e2ffe0510861196bb99982056332a17d0d6ce7
```

Compare against the committed file with `sha256sum models/model.onnx`. If the
length matches but the digest does not, the file was re-encoded in transit,
and every score the demo produces will be wrong while still looking plausible.

### 3.2 The runtime and its wasm serve with the right types

```sh
curl -sSI "$SITE/vendor/ort/ort-wasm-simd-threaded.wasm" | grep -i 'content-type\|content-length'
curl -sSI "$SITE/vendor/ort/ort.wasm.min.js"            | grep -i 'content-type'
```

The `.wasm` should come back as `application/wasm`. If it arrives as
`text/html` or `application/octet-stream`, the streaming compile path fails and
the demo errors on load.

Threading is **not** a concern here. GitHub Pages cannot set the `COOP`/`COEP`
headers that `SharedArrayBuffer` requires, so a threaded runtime would fall
back to one thread anyway — but `app.js` already pins `ort.env.wasm.numThreads
= 1` explicitly, so Pages and localhost run the identical single-threaded path.
This is the usual localhost-versus-Pages trap, and it does not apply.

### 3.3 The demo end to end, in a real browser

Local passes do not count for this one. In a normal browser window on the live
URL, with DevTools open on the Console and Network tabs:

1. Open `$SITE/#demo`.
2. Tick the acknowledgement. The Load button and the file input are `disabled`
   in the markup, so neither becomes usable before the tick.
3. **Load model.** Watch `models/model.onnx` in the Network tab and confirm it
   reports 47,693,953 bytes from the network on this first load.
4. Choose `test/cell_a.png` from a local clone of this repo.
5. Expect **0.813**, verdict **Flagged for review**, the "a score, not a
   finding" caveat beside it, and **zero console errors**.

0.813 is the same number the fixture produces locally. Getting it here proves
preprocessing, the model bytes, the `1 - output` mapping, and the 0.770
threshold all survived the trip to Pages. See `test/REGRESSION.md` for what to
check first when it does not, and note that 0.813 is a checksum on a synthetic
drawn image — never a result on a real cell.

Then reload and load the model a second time. It should come from Cache
Storage with **no network request for `model.onnx` at all**. A request marked
`(from disk cache)` is the HTTP cache, which is a different mechanism.
`test/CACHE_CHECK.md` has the full procedure — this is the first environment
where those two unverified checks can actually be run, since Cache Storage is
broken in headless Chrome on the dev machine.

### 3.4 Indexing metadata

```sh
curl -sS "$SITE/robots.txt"
curl -sS "$SITE/sitemap.xml"
curl -sSL -o /dev/null -w 'og-card %{http_code} %{content_type} %{size_download}\n' "$SITE/og-card.png"
curl -sS "$SITE/" | grep -E '<title>|rel="canonical"|og:url|og:image'
```

- `og-card.png` must be **200**, `image/png`, **48744** bytes. A link preview
  that 404s on its image degrades to a bare text card.
- The `canonical` and `og:url` values must match the URL you actually browsed,
  **including the trailing slash**. A canonical that disagrees by a slash is
  treated as a different page.
- `robots.txt` disallows `/models/` and `/vendor/` deliberately. Neither is
  needed to render — both load only after the acknowledgement and the Load
  button — so a crawler that never fetches them still sees the whole document.

Paste the live URL into Slack or a DM to confirm the preview card renders.
Facebook's and LinkedIn's debuggers cache aggressively; if you change
`og:image` later, re-scrape there rather than trusting what you see.

### 3.5 The page without JavaScript

Disable JavaScript in DevTools and reload. All four panels should render as one
long scrolling document, with the tab bar hidden. This is the state a crawler
sees, and it is how the panels stay indexable. If the page comes up blank or
shows only one panel, the pre-paint head script is misbehaving.

---

## 4. Moving to a custom domain later

The deploy origin is written in **six** places. Change all six together:

| File | Line | Trailing slash |
|---|---|---|
| `index.html` | 28 | `rel="canonical"` — **yes** |
| `index.html` | 34 | `og:url` — **yes** |
| `index.html` | 36 | `og:image` — **no**, ends in `og-card.png` |
| `index.html` | 51 | JSON-LD `"url"` — **yes**, and **untagged** |
| `robots.txt` | 13 | `Sitemap:` — no, ends in `sitemap.xml` |
| `sitemap.xml` | 7 | `<loc>` — **yes** |

Grep `[SITE URL]` to find three of the four in `index.html`. The JSON-LD `url`
carries no tag because JSON forbids comments, so the grep misses it — that is
the one to check by hand.

Then add a `CNAME` file at the repo root containing the bare domain, point the
DNS records at GitHub, and re-tick **Enforce HTTPS** once the certificate is
issued.

Also bump `<lastmod>` in `sitemap.xml` when the page content changes
meaningfully. It currently reads `2026-09-12`.

---

## 5. If a deploy goes wrong

Pages serves whatever `main` points at. Reverting is a normal push:

```sh
git revert -m 1 <merge-commit>     # undo the merge, keeping history honest
git push origin main
```

Do not force-push `main` to fix a bad deploy. The repository is public, the
history is already out, and rewriting it after publication breaks every clone
without actually retracting anything.
