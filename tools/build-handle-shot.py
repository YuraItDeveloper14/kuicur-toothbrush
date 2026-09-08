"""Turn the owner's phone photo of the handle into the page asset.

The source is only 384x512 and the handle itself is 42px wide in it, so the
job is to spend those pixels well rather than to invent detail: flatten the
background onto the page colour, damp the sensor noise on the smooth body
without touching the printed icons, then grow the image in two steps with a
little sharpening at each so the edges stay crisp.

Run:  python tools/build-handle-shot.py
"""

from PIL import Image, ImageCms, ImageFilter
import numpy as np
import os

HERE   = os.path.dirname(os.path.abspath(__file__))
IMG    = os.path.join(HERE, '..', 'assets', 'img')
SRC    = os.path.join(IMG, 'brush-photo.png')
DST    = os.path.join(IMG, 'handle-shot.png')

TARGET  = np.array([237, 241, 239], np.float32)  # --porcelain
# Framing is held as fractions of the source, so a bigger original can be
# dropped in without re-measuring anything.
CROP_X  = (145 / 384, 240 / 384)                 # the handle's own column
STRIP_A = (146 / 384, 165 / 384)                 # background, left of the handle
STRIP_B = (216 / 384, 239 / 384)                 # background, right of it
OUT_W   = 800                                    # what a HiDPI screen asks for
# The printed wordmark, as fractions of the source. On the real handle it is a
# light grey print; the upscaler hardened it into a black stamp and welded the
# arms of the K together, so it gets lifted back towards the body colour.
LOGO    = (690 / 1500, 975 / 2000, 800 / 1500, 1015 / 2000)
LOGO_K  = 0.46                                   # how much of the darkening to keep
# Same story for the printed mode icons: on the handle they are a mid grey line,
# about #9E9E9E with the indicator dots near #464646. The upscale drove them to
# black, so they get lifted too — a little less, since they carry more weight
# than the wordmark does.
ICONS   = (700 / 1500, 1160 / 2000, 800 / 1500, 1705 / 2000)
ICONS_K = 0.66
# The smallest marks — the sparkles, the hearts, the waves — were already gone
# when the photograph reached us, and no amount of tone work brings them back.
# The strip is wiped to bare cylinder here and the icons are drawn over it as
# SVG in the page, matching the maker's own artwork.
ERASE_ICONS = True
# The handle is neutral grey on the real product; flattening the background onto
# the page's slightly green porcelain drags a cast onto it as well. This is the
# body's own column, and the collar band that must stay gold.
# The power button reads only a shade darker than the body on the real handle;
# the upscale deepened it into a grey disc, so it is eased back too.
BUTTON  = (696 / 1500, 1044 / 2000, 800 / 1500, 1150 / 2000)
BUTTON_K = 0.6
BODY_X  = (655 / 1500, 845 / 1500)               # the body, in the source frame
COLLAR_Y = (0.365, 0.475)                        # of the source height
IBP     = 4                                      # back-projection passes


def box_blur(a, r):
    """Separable box blur over a float image, edges held rather than darkened."""
    pad = np.pad(a, ((r, r), (r, r), (0, 0)), mode='edge')
    c = np.cumsum(pad, axis=0)
    a = (c[2 * r:, :, :] - c[:-2 * r, :, :]) / (2 * r)
    c = np.cumsum(a, axis=1)
    return (c[:, 2 * r:, :] - c[:, :-2 * r, :]) / (2 * r)


def flatten_background(im):
    """Lift every row so the background lands exactly on the page colour.

    The reference strips flank the handle's column instead of sitting at the
    far edges of the frame, so any left-to-right falloff in the shot is taken
    out along with the top-to-bottom one.
    """
    w = im.shape[1]
    a0, a1 = int(STRIP_A[0] * w), int(STRIP_A[1] * w)
    b0, b1 = int(STRIP_B[0] * w), int(STRIP_B[1] * w)

    def bg_of(a):
        strips = np.concatenate([a[:, a0:a1, :], a[:, b0:b1, :]], axis=1)
        bg = np.median(strips, axis=1)
        bg = np.stack([np.convolve(bg[:, c], np.ones(9) / 9, mode='same')
                       for c in range(3)], axis=1)
        bg[:5] = bg[5]
        bg[-5:] = bg[-6]
        return bg

    for _ in range(3):                            # converges after two
        im = im + (TARGET - bg_of(im))[:, None, :]
    return np.clip(im, 0, 255)


def denoise_flat_areas(im, radius=2, knee=12.0):
    """Blend towards a blur only where the neighbourhood is already flat.

    Local variance stands in for detail: the printed icons, the collar and the
    bristles keep every pixel, while the smooth body and the background lose
    the grain that sharpening would otherwise amplify.
    """
    smooth = box_blur(im, radius)
    var = box_blur((im - smooth) ** 2, radius).mean(axis=2, keepdims=True)
    detail = np.clip(var / knee, 0.0, 1.0)
    return detail * im + (1.0 - detail) * smooth


def lift(im, box, keep):
    """Lift a printed mark back towards the surface it is printed on.

    The upscaler resolves faint grey printing into hard black. Rescaling the
    patch about its own plate colour returns the weight without moving the
    shapes: `keep` is how much of the darkening survives.
    """
    h, w = im.shape[:2]
    x0, y0, x1, y1 = (round(box[0] * w), round(box[1] * h),
                      round(box[2] * w), round(box[3] * h))
    patch = im[y0:y1, x0:x1]
    plate = np.percentile(patch.reshape(-1, 3), 88, axis=0)
    im[y0:y1, x0:x1] = plate - (plate - patch) * keep
    return im


def erase_strip(im, box):
    """Wipe a printed strip back to bare cylinder.

    The body is a smooth tube, so its shading varies gently from left to right.
    Replacing the strip with a straight blend between the columns on either
    side of it rebuilds that shading with nothing left over.
    """
    h, w = im.shape[:2]
    x0, y0, x1, y1 = (round(box[0] * w), round(box[1] * h),
                      round(box[2] * w), round(box[3] * h))
    pad = max(4, (x1 - x0) // 12)
    left = im[y0:y1, x0 - pad:x0].mean(axis=1, keepdims=True)
    right = im[y0:y1, x1:x1 + pad].mean(axis=1, keepdims=True)
    t = np.linspace(0, 1, x1 - x0, dtype=np.float32)[None, :, None]
    im[y0:y1, x0:x1] = left * (1 - t) + right * t
    return im


def neutralise_handle(im):
    """Take the colour cast off the handle, leaving the collar and background.

    The product is neutral grey; the page it sits on is not. Flattening the
    background onto the page colour tints the handle with it, so the tint is
    removed again over the body's own column — everywhere except the collar,
    which really is gold.
    """
    h, w = im.shape[:2]
    xs = np.arange(w)
    x0, x1 = BODY_X[0] * w, BODY_X[1] * w
    edge = max(4.0, 0.02 * w)
    mask_x = np.clip((xs - x0) / edge, 0, 1) * np.clip((x1 - xs) / edge, 0, 1)

    ys = np.arange(h)
    c0, c1 = COLLAR_Y[0] * h, COLLAR_Y[1] * h
    fade = max(4.0, 0.01 * h)
    in_collar = np.clip((ys - c0) / fade, 0, 1) * np.clip((c1 - ys) / fade, 0, 1)
    mask = mask_x[None, :] * (1.0 - in_collar)[:, None]

    grey = im.mean(axis=2, keepdims=True)
    return im + (grey - im) * mask[..., None]


def grow(img, factor, percent):
    """One upscale step, sharpened straight after so edges do not soften twice."""
    w, h = img.size
    img = img.resize((int(w * factor), int(h * factor)), Image.LANCZOS)
    return img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=percent, threshold=2))


def back_project(big, small, rounds=IBP, gain=0.60):
    """Iterative back-projection.

    Shrinking the enlargement must reproduce the original. Wherever it does
    not, the shortfall is enlarged and added back. This recovers detail the
    resampling filter smeared, and it invents nothing: the only information
    used is the source itself.
    """
    target = np.asarray(small, np.float32)
    hi = np.asarray(big, np.float32)
    w, h = small.size
    W, H = big.size
    for _ in range(rounds):
        down = np.asarray(Image.fromarray(np.clip(hi, 0, 255).astype(np.uint8))
                          .resize((w, h), Image.LANCZOS), np.float32)
        err = target - down
        up = np.asarray(Image.fromarray(np.clip(err + 128, 0, 255).astype(np.uint8))
                        .resize((W, H), Image.LANCZOS), np.float32) - 128
        hi = hi + up * gain
    return Image.fromarray(np.clip(hi, 0, 255).astype(np.uint8))


def main():
    src = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)

    work = flatten_background(src)
    work = neutralise_handle(work)
    work = lift(work, LOGO, LOGO_K)
    work = erase_strip(work, ICONS) if ERASE_ICONS else lift(work, ICONS, ICONS_K)
    work = lift(work, BUTTON, BUTTON_K)
    work = denoise_flat_areas(work)

    img = Image.fromarray(np.clip(work, 0, 255).astype(np.uint8))
    w = img.width
    img = img.crop((round(CROP_X[0] * w), 0, round(CROP_X[1] * w), img.height))

    base = img                                    # the crop, at its real detail
    # Grow in halving steps so no single resample has to invent much, and
    # sharpen a little after each so edges do not soften twice over.
    while img.width * 2 <= OUT_W:
        img = grow(img, 2, 45)
    if img.width != OUT_W:
        img = img.resize((OUT_W, round(img.height * OUT_W / img.width)), Image.LANCZOS)
    # pull the enlargement back into agreement with the source
    img = back_project(img, base)
    # a last short-radius pass so the printed icons keep their edge
    img = img.filter(ImageFilter.UnsharpMask(radius=1.4, percent=70, threshold=3))

    # Tagged sRGB. An untagged file is meant to be read as sRGB, but some
    # phone browsers guess a wide gamut instead and the neutral body comes out
    # warm; saying so explicitly removes the guess.
    icc = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    img.save(DST, optimize=True, icc_profile=icc)
    # the page loads the WebP: same picture, a seventh of the bytes
    img.save(DST.replace('.png', '.webp'), 'WEBP', quality=93, method=6, icc_profile=icc)

    check = np.asarray(img)
    print('wrote %s  %dx%d  %.0f KB' % (os.path.basename(DST), img.width, img.height,
                                        os.path.getsize(DST) / 1024))
    print('corners TL %s TR %s BL %s BR %s   target %s'
          % (check[4, 3], check[4, -4], check[-5, 3], check[-5, -4], TARGET.astype(int)))


if __name__ == '__main__':
    main()
