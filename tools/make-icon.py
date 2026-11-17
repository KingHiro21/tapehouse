#!/usr/bin/env python3
"""Draws the Tapehouse icon (a cassette in a house) into build/icon.png and build/icon.ico.

Small sizes use their own layout: at 16-32 px the label strip is dropped, the roof is
wider and the body taller, so the mark survives in the taskbar and the tray."""
import io
import struct

from PIL import Image, ImageDraw

SIZES = [16, 24, 32, 48, 64, 128, 256]
BG_TOP, BG_BOTTOM = (27, 26, 32), (16, 15, 19)
ACCENT = (226, 179, 107)
CREAM = (244, 235, 217)
CREAM_DARK = (214, 201, 178)
INK = (23, 22, 27)

# Ratios of the icon square: roof apex/eaves/half-width, body and window boxes, reel radius/centre/offsets.
FULL = dict(apex=0.203, eaves=0.493, half=0.363, body=(0.181, 0.459, 0.819, 0.793),
            window=(0.285, 0.532, 0.715, 0.684), reel=(0.051, 0.608, (0.406, 0.594)),
            detail=True)
COMPACT = dict(apex=0.155, eaves=0.600, half=0.435, body=(0.145, 0.505, 0.855, 0.855),
               window=(0.245, 0.595, 0.755, 0.745), reel=(0.082, 0.670, (0.375, 0.625)),
               detail=False)


def draw(size, layout):
    s = size * 8  # supersample, then downscale for clean edges
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))

    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.21), fill=255)
    grad = Image.new('RGB', (1, s))
    for y in range(s):
        t = y / (s - 1)
        grad.putpixel((0, y), tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP, BG_BOTTOM)))
    img.paste(grad.resize((s, s)), (0, 0), mask)

    d = ImageDraw.Draw(img)
    box = lambda b: [b[0] * s, b[1] * s, b[2] * s, b[3] * s]
    L, W = layout, layout['window']
    d.polygon([((0.5 - L['half']) * s, L['eaves'] * s), (0.5 * s, L['apex'] * s), ((0.5 + L['half']) * s, L['eaves'] * s)], fill=ACCENT)
    d.rounded_rectangle(box(L['body']), radius=int(s * 0.045), fill=CREAM)
    d.rounded_rectangle(box(W), radius=int(s * 0.03), fill=INK)
    radius, cy, centres = L['reel']
    for cx in centres:
        d.ellipse([(cx - radius) * s, (cy - radius) * s, (cx + radius) * s, (cy + radius) * s], fill=ACCENT)
        if layout['detail']:
            d.ellipse([(cx - radius * 0.3) * s, (cy - radius * 0.3) * s, (cx + radius * 0.3) * s, (cy + radius * 0.3) * s], fill=INK)
    if layout['detail']:
        d.rounded_rectangle([L['body'][0] * s, (L['body'][3] - 0.041) * s, L['body'][2] * s, L['body'][3] * s], radius=int(s * 0.045), fill=CREAM_DARK)
        d.rounded_rectangle([0.311 * s, 0.709 * s, 0.689 * s, 0.734 * s], radius=int(s * 0.013), fill=CREAM_DARK)

    return img.resize((size, size), Image.LANCZOS)


def bmp_entry(img):
    """32bpp BITMAPINFOHEADER entry, what Windows writes itself for small sizes."""
    s = img.size[0]
    pixels = img.transpose(Image.FLIP_TOP_BOTTOM).tobytes('raw', 'BGRA')
    header = struct.pack('<IiiHHIIiiII', 40, s, s * 2, 1, 32, 0, len(pixels), 0, 0, 0, 0)
    return header + pixels + bytes(((s + 31) // 32 * 4) * s)  # empty AND mask, alpha does the work


def png_entry(img):
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def write_ico(path, images):
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = blobs = b''
    for size, payload in images:
        dim = 0 if size == 256 else size  # 256 wraps to 0 in the directory
        entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(payload), offset)
        blobs += payload
        offset += len(payload)
    with open(path, 'wb') as f:
        f.write(header + entries + blobs)


images = [(size, (png_entry if size >= 64 else bmp_entry)(draw(size, COMPACT if size <= 32 else FULL))) for size in SIZES]
draw(1024, FULL).save('build/icon.png')
write_ico('build/icon.ico', images)
print('wrote build/icon.png (1024) and build/icon.ico', [s for s, _ in images])
