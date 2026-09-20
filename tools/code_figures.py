"""Draws the code-provision plates shown on codes.html.

One function per provision, written as plain SVG to assets/codes/<id>.svg.
Unlike tools/quiz_figures.py these stay SVG — the page shows them on a white
plate at any width, so no screenshot step is needed.
Run from the repo root:  python tools/code_figures.py

Every dimension is taken from the law itself; the cite in data/codes.json
says which clause.
"""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from quiz_figures import svg, rect, line, cap, poly  # noqa: E402

WALL = '#d7dde2'
SLAB = '#eef2f5'
HOT = '#c0392b'


def dim(x1, y1, x2, y2, text, off=0, flip=False):
    """Dimension line with ticks at both ends, text centred above it."""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    t = 4
    tick = (f'<line class="lead" x1="{x1}" y1="{y1 - t}" x2="{x1}" y2="{y1 + t}"/>'
            f'<line class="lead" x1="{x2}" y1="{y2 - t}" x2="{x2}" y2="{y2 + t}"/>'
            if y1 == y2 else
            f'<line class="lead" x1="{x1 - t}" y1="{y1}" x2="{x1 + t}" y2="{y1}"/>'
            f'<line class="lead" x1="{x2 - t}" y1="{y2}" x2="{x2 + t}" y2="{y2}"/>')
    if y1 == y2:
        txt = cap(mx, my - 6 + off if not flip else my + 15 + off, text)
    else:
        txt = (f'<text class="cap" x="{mx + 8 + off}" y="{my + 4}" '
               f'text-anchor="start">{text}</text>')
    return line(x1, y1, x2, y2) + tick + txt


def ramp_section():
    """BP 344 (2024 RIRR) A.1.2 — the 1:15 ramp in section."""
    # 1:15 run of 10.50 m rising 700 mm, then a 1800 mm landing.
    x0, y0 = 50, 150                      # foot of the ramp
    run, rise = 330, 22                   # 10.50 m drawn at ~31 px/m
    land = 57                             # 1800 mm landing
    top = y0 - rise
    b = [
        poly([(x0, y0), (x0 + run, top), (x0 + run + land, top),
              (x0 + run + land, y0 + 16), (x0, y0 + 16)], SLAB),
        # handrails at 700 and 900 mm, with their 300 mm level extensions
        line(x0 - 12, y0 - 36, x0, y0 - 36, 's'),
        line(x0, y0 - 36, x0 + run, top - 36, 's'),
        line(x0 + run, top - 36, x0 + run + land + 12, top - 36, 's'),
        line(x0 - 12, y0 - 28, x0, y0 - 28, 's'),
        line(x0, y0 - 28, x0 + run, top - 28, 's'),
        line(x0 + run, top - 28, x0 + run + land + 12, top - 28, 's'),
        # tactile warning strip 300 mm from the foot, 600 mm deep
        rect(x0 + 10, y0 - 2, 20, 4, HOT),
        cap(x0 + 20, y0 + 34, 'Tactile 600'),
        cap(x0 - 24, y0 - 58, 'Handrails', anchor='start'),
        cap(x0 - 24, y0 - 44, '900 / 700', anchor='start'),
        dim(x0, y0 + 50, x0 + run, y0 + 50, 'Max run 10.50 m at 1:15', flip=True),
        dim(x0 + run, y0 + 50, x0 + run + land, y0 + 50, 'Landing 1800', flip=True),
        dim(x0 + run + land + 20, top, x0 + run + land + 20, y0, 'Rise 700'),
    ]
    return svg(520, 230, ''.join(b))


def parking_slot():
    """BP 344 (2024 RIRR) A.6.7 — accessible slot in plan."""
    k = 40                                # px per metre
    x0, y0 = 150, 46
    w, h = int(4 * k), int(5 * k)
    walk = int(1.2 * k)
    b = [
        rect(x0, y0, w, h, SLAB),
        # the ordinary 2.50 m slot beside it, for the comparison the law makes
        rect(x0 - int(2.5 * k) - 6, y0, int(2.5 * k), h, '#fff'),
        cap(x0 - int(1.25 * k) - 6, y0 + h / 2 - 6, 'Ordinary'),
        cap(x0 - int(1.25 * k) - 6, y0 + h / 2 + 10, '2.50 m'),
        rect(x0, y0 + h + 6, w, walk, '#fff'),
        cap(x0 + w / 2, y0 + h + 6 + walk / 2 + 4, 'Walkway 1200'),
        dim(x0, y0 - 14, x0 + w, y0 - 14, 'Width 4000'),
        dim(x0 + w + 20, y0, x0 + w + 20, y0 + h, 'Length 5000'),
        cap(x0 + w / 2, y0 + h / 2 - 6, 'Accessible'),
        cap(x0 + w / 2, y0 + h / 2 + 10, 'slot'),
    ]
    return svg(520, 310, ''.join(b))


def toilet_cubicle():
    """BP 344 (2024 RIRR) C.6.3 — accessible cubicle in plan."""
    k = 110                               # px per metre
    x0, y0 = 150, 46
    s = int(1.8 * k)                      # 1800 x 1800 cubicle
    wc_c = x0 + int(0.45 * k)             # closet centreline, 450 mm off the side wall
    b = [
        rect(x0 - 8, y0 - 8, s + 16, s + 16, WALL),
        rect(x0, y0, s, s, '#fff'),
        # water closet against the back wall
        rect(wc_c - 20, y0 + 6, 40, 56, SLAB),
        cap(wc_c, y0 + 80, 'WC'),
        # L-type grab bar on the side wall, flip-up bar on the other side
        line(wc_c - 38, y0 + 6, wc_c - 38, y0 + 96, 's'),
        line(wc_c - 38, y0 + 96, wc_c - 38 + 34, y0 + 96, 's'),
        line(wc_c + 38, y0 + 6, wc_c + 38, y0 + 70, 's'),
        cap(wc_c - 21, y0 + 112, 'L-type'),
        cap(wc_c + 68, y0 + 40, 'Flip-up'),
        dim(x0, y0 + s + 22, x0 + s, y0 + s + 22, '1800', flip=True),
        dim(x0 + s + 22, y0, x0 + s + 22, y0 + s, '1800'),
        dim(x0, y0 + 146, wc_c, y0 + 146, '450', flip=True),
        cap(wc_c + 10, y0 + 161, 'to WC centreline', anchor='start'),
    ]
    return svg(520, 300, ''.join(b))


FIGURES = {
    'bp344-ramp': ramp_section,
    'bp344-parking-slot': parking_slot,
    'bp344-toilet-cubicle': toilet_cubicle,
}


def write(name, s):
    out = os.path.join('assets', 'codes', name + '.svg')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(s)
    return out


if __name__ == '__main__':
    for name, fn in FIGURES.items():
        s = fn()
        assert s.startswith('<svg') and '</svg>' in s, name
        print('wrote', write(name, s))
