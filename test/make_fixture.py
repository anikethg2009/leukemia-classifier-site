"""Regenerate the demo regression fixture.

The fixture is SYNTHETIC. It is a drawn approximation of a stained white
blood cell -- two filled circles and uniform noise -- not a real cell and not
from any dataset. Its expected score of 0.813 is therefore a check that the
inference path still behaves identically, and nothing else. It says nothing
about the model's accuracy, and it must never be quoted as a result on a real
cell or shown as an example of the model working.

Deterministic: numpy's default_rng(7) fixes the noise, so the PNG is
byte-identical on every machine. Verify with the sha256 below before trusting
a regression run -- a different fixture will produce a different score, and
the score is only meaningful against this exact input.

    python test/make_fixture.py

Writes test/cell_a.png. See test/REGRESSION.md for what to do with it.
"""
import hashlib
import os

import numpy as np
from PIL import Image

SHA256 = "0dab6a29dcaa1d96"          # first 16 hex of the full digest
EXPECTED_SCORE = "0.813"
EXPECTED_VERDICT = "Flagged for review"

here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, "cell_a.png")

rng = np.random.default_rng(7)
yy, xx = np.mgrid[0:224, 0:224]
img = np.full((224, 224, 3), (243, 235, 240), np.uint8)
img[((xx - 118) ** 2 + (yy - 106) ** 2) < 74 ** 2] = (226, 168, 190)   # cytoplasm
img[((xx - 108) ** 2 + (yy - 100) ** 2) < 46 ** 2] = (92, 44, 128)     # nucleus
img = np.clip(img.astype(int) + rng.integers(-6, 7, img.shape), 0, 255).astype(np.uint8)
Image.fromarray(img).save(out)

digest = hashlib.sha256(open(out, "rb").read()).hexdigest()
print("wrote %s" % out)
print("sha256 %s  expected %s  %s"
      % (digest[:16], SHA256, "OK" if digest[:16] == SHA256 else "MISMATCH"))
raise SystemExit(0 if digest[:16] == SHA256 else 1)
