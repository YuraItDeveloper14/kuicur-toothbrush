"""Sit the kit photograph on the page instead of on its own white card.

The listing shot has a pure-white studio background, which reads as a picture
borrowed from somewhere else the moment it lands on a porcelain page. The fix
is to recolour only the background: flood in from the border through connected
near-white pixels, so the white travel case and the white bristles keep their
own white and only the sheet behind them changes.

Run:  python tools/build-kit-shot.py
"""

from PIL import Image
import numpy as np
import os

HERE   = os.path.dirname(os.path.abspath(__file__))
IMG    = os.path.join(HERE, '..', 'assets', 'img')
SRC    = os.path.join(IMG, 'kit-photo.png')
DST    = os.path.join(IMG, 'kit-shot.png')

TARGET = np.array([237, 241, 239], np.float32)   # --porcelain
NEAR_WHITE = 244                                 # min channel value to flood through


def flood_from_border(passable):
    """Everything reachable from the frame edge through `passable` pixels."""
    seen = np.zeros_like(passable)
    seen[0, :] = passable[0, :]
    seen[-1, :] = passable[-1, :]
    seen[:, 0] = passable[:, 0]
    seen[:, -1] = passable[:, -1]

    while True:
        grown = seen.copy()
        grown[1:, :] |= seen[:-1, :]
        grown[:-1, :] |= seen[1:, :]
        grown[:, 1:] |= seen[:, :-1]
        grown[:, :-1] |= seen[:, 1:]
        grown &= passable
        if grown.sum() == seen.sum():
            return seen
        seen = grown


def main():
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)

    passable = im.min(axis=2) >= NEAR_WHITE
    bg = flood_from_border(passable)
    print('background is %.1f%% of the frame' % (bg.mean() * 100))

    # A soft edge: pixels next to the background get part of the shift, so the
    # product's outline does not end in a hard step.
    soft = bg.astype(np.float32)
    for _ in range(2):
        s = soft.copy()
        s[1:, :] = np.maximum(s[1:, :], soft[:-1, :] * 0.55)
        s[:-1, :] = np.maximum(s[:-1, :], soft[1:, :] * 0.55)
        s[:, 1:] = np.maximum(s[:, 1:], soft[:, :-1] * 0.55)
        s[:, :-1] = np.maximum(s[:, :-1], soft[:, 1:] * 0.55)
        soft = s

    out = im * (1 - soft[..., None]) + TARGET * soft[..., None]
    out = np.clip(out, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(DST, optimize=True)
    Image.fromarray(out).save(DST.replace('.png', '.webp'), 'WEBP', quality=93, method=6)

    print('wrote %s  %.0f KB' % (os.path.basename(DST), os.path.getsize(DST) / 1024))
    print('corners', out[2, 2], out[2, -3], out[-3, 2], out[-3, -3], ' target', TARGET.astype(int))


if __name__ == '__main__':
    main()
