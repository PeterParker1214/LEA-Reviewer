"""Draws the Building Technology quiz figures as PNGs.

Each figure is written as plain SVG, then screenshotted by headless Edge at 2x
so the site gets a crisp PNG. Output: subjects/building-technology/quizzes/img/.
Run from the repo root:  python tools/btech_figures.py
"""
import math, os, subprocess, tempfile

OUT = os.path.join('subjects', 'building-technology', 'quizzes', 'img')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
INK = '#1f2328'
STYLE = f'''<style>
text{{font-family:Arial,Helvetica,sans-serif;fill:{INK}}}
.L{{font-size:17px;font-weight:bold}} .cap{{font-size:13px;fill:#555}} .t{{font-size:12px}}
.s{{stroke:{INK};stroke-width:1.4;stroke-linejoin:round}} .lead{{stroke:{INK};stroke-width:1;fill:none}}
.cut{{stroke:#c0392b;stroke-width:2.2;stroke-dasharray:7 4;fill:none}}
</style>'''


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'{STYLE}<rect width="{w}" height="{h}" fill="#fff"/>{body}</svg>')


def poly(pts, fill, cls='s', extra=''):
    return f'<polygon class="{cls}" fill="{fill}" points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" {extra}/>'


def rect(x, y, w, h, fill, extra=''):
    return f'<rect class="s" x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" {extra}/>'


def line(x1, y1, x2, y2, cls='lead'):
    return f'<line class="{cls}" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>'


def label(letter, lx, ly, tx, ty):
    """Letter at (lx,ly) with a leader line to the target point (tx,ty)."""
    dx, dy = tx - lx, ty - ly
    d = math.hypot(dx, dy) or 1
    sx, sy = lx + dx / d * 11, ly + dy / d * 11
    return (line(sx, sy, tx, ty) + f'<circle cx="{tx:.1f}" cy="{ty:.1f}" r="2.2" fill="{INK}"/>'
            f'<text class="L" x="{lx}" y="{ly + 6}" text-anchor="middle">{letter}</text>')


def cap(x, y, s, anchor='middle', cls='cap'):
    return f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{s}</text>'


class Axo:
    """Axonometric projection: camera in front (-y) and to the right (+x), looking down."""
    def __init__(self, ox, oy, k, az=30, el=28):
        self.ox, self.oy, self.k = ox, oy, k
        self.c, self.s = math.cos(math.radians(az)), math.sin(math.radians(az))
        self.ce, self.se = math.cos(math.radians(el)), math.sin(math.radians(el))

    def __call__(self, x, y, z):
        u = x * self.c + y * self.s
        depth = -x * self.s + y * self.c
        v = z * self.ce + depth * self.se
        return self.ox + u * self.k, self.oy - v * self.k

    def poly(self, pts, fill, cls='s'):
        return poly([self(*p) for p in pts], fill, cls)

    def line(self, a, b, cls='lead'):
        return line(*self(*a), *self(*b), cls=cls)


# ---------------------------------------------------------------- figures

def curtain_wall():
    """Plan section through a stick-system mullion (pressure-plate glazing)."""
    b = []
    b.append(cap(260, 24, 'INTERIOR', cls='t') + cap(260, 300, 'EXTERIOR', cls='t'))
    b.append(rect(232, 50, 56, 120, '#c9ced4'))                     # mullion tube
    b.append(rect(242, 60, 36, 100, '#fff'))                        # hollow
    b.append(rect(254, 170, 12, 46, '#c9ced4'))                     # nose / screw spline
    for x0, x1 in ((40, 247), (273, 480)):                          # two IGUs
        b.append(rect(x0, 180, x1 - x0, 6, '#cfe6f2'))              # inner lite
        b.append(rect(x0, 198, x1 - x0, 6, '#cfe6f2'))              # outer lite
        sx = x1 - 14 if x0 == 40 else x0
        b.append(rect(sx, 186, 14, 12, '#6b7280'))                  # spacer
    for gx in (234, 274):                                           # gaskets
        b.append(rect(gx, 170, 12, 10, '#222'))
        b.append(rect(gx, 204, 12, 10, '#222'))
    b.append(rect(222, 214, 76, 10, '#9aa3ad'))                     # pressure plate
    b.append(line(260, 208, 260, 232, cls='s'))                     # screw
    b.append(f'<path class="s" fill="#e3e6ea" d="M214 212 H306 V246 H214 Z M222 212 V238 H298 V212"/>')  # snap cap
    b.append(label('A', 110, 150, 110, 200))
    b.append(label('B', 190, 262, 240, 209))
    b.append(label('C', 360, 262, 290, 219))
    b.append(label('D', 360, 90, 288, 100))
    b.append(label('E', 160, 150, 240, 192))
    b.append(label('F', 400, 290, 290, 246))
    b.append(cap(260, 342, 'Curtain wall, stick system — horizontal section at a mullion'))
    return svg(520, 356, ''.join(b))


def window_frame():
    """Elevation of a trimmed wood window."""
    b = []
    b.append(rect(70, 40, 280, 30, '#d8c3a0'))                      # head casing
    b.append(rect(70, 70, 30, 280, '#d8c3a0') + rect(320, 70, 30, 280, '#d8c3a0'))  # side casings
    b.append(rect(100, 70, 220, 15, '#ecdcc0'))                     # head jamb
    b.append(rect(100, 85, 15, 265, '#ecdcc0') + rect(305, 85, 15, 265, '#ecdcc0'))  # side jambs
    b.append(rect(115, 85, 190, 265, '#b98f5e'))                    # sash frame
    b.append(rect(137, 107, 146, 221, '#d6ebf5'))                   # glass
    b.append(line(160, 300, 240, 130, cls='lead') + line(185, 305, 262, 140, cls='lead'))
    b.append(rect(55, 350, 310, 18, '#caa77c'))                     # stool / sill
    b.append(rect(88, 368, 244, 22, '#d8c3a0'))                     # apron
    b.append(label('A', 36, 55, 90, 55))
    b.append(label('B', 36, 200, 84, 200))
    b.append(label('C', 390, 60, 250, 78))
    b.append(label('D', 390, 150, 313, 150))
    b.append(label('E', 390, 250, 294, 250))
    b.append(label('F', 390, 359, 358, 359))
    b.append(label('G', 36, 385, 96, 380))
    b.append(cap(210, 418, 'Window assembly (elevation)'))
    return svg(420, 432, ''.join(b))


def slab_bands():
    """Reflected ceiling plan + section of a slab with slab bands."""
    b = []
    xs, ys = (70, 260, 450), (40, 140, 240)
    b.append(rect(48, 18, 424, 244, '#f1f3f5'))
    for x in xs:
        b.append(f'<rect x="{x - 22}" y="18" width="44" height="244" fill="#b8c0c8"/>')
    for y in ys:
        b.append(f'<rect x="48" y="{y - 22}" width="424" height="44" fill="#b8c0c8"/>')
    b.append(f'<rect x="48" y="18" width="424" height="244" fill="none" stroke="{INK}" stroke-width="1.4"/>')
    for x in xs:
        for y in ys:
            b.append(rect(x - 8, y - 8, 16, 16, INK))
    b.append(cap(150, 284, 'Plan of the underside (looking up)'))
    b.append(rect(300, 274, 16, 12, '#b8c0c8') + cap(322, 284, 'deeper (thickened) zone', 'start', 't')
             + rect(300, 292, 16, 12, '#f1f3f5') + cap(322, 302, 'slab at normal thickness', 'start', 't'))
    top, t, band = 336, 12, 26
    b.append(rect(30, top, 460, t, '#d9dde1'))
    for x in xs:
        b.append(rect(x - 40, top + t, 80, band - t, '#b8c0c8'))
        b.append(rect(x - 8, top + band, 16, 60, '#8b949e'))
    b.append(cap(260, 442, 'Section'))
    return svg(520, 456, ''.join(b))


def roof():
    """Hip roof with a gable dormer, true 3D geometry in axonometric."""
    P = Axo(70, 365, 44)
    W, D, H, R = 10, 6, 3, 2.5                     # house 10 x 6, walls 3, roof rise 2.5
    z = lambda y: H + R * y / 3                    # front roof plane height at depth y
    wall, roofc, trim = '#efe7da', '#b04a3a', '#8e3a2d'
    b = [P.poly([(0, 0, 0), (W, 0, 0), (W, 0, H), (0, 0, H)], wall),
         P.poly([(W, 0, 0), (W, D, 0), (W, D, H), (W, 0, H)], '#e0d6c6'),
         P.poly([(0, 0, H), (W, 0, H), (7, 3, H + R), (3, 3, H + R)], roofc),
         P.poly([(W, 0, H), (W, D, H), (7, 3, H + R)], '#933b2e')]
    # dormer: front wall at y=0.9, eaves 0.7 above its base, gable 0.7 more
    yf, x0, x1, xm = 0.6, 3.6, 6.4, 5.0
    zb, ze = z(yf), z(yf) + 0.8
    zr = ze + 0.7
    ye, yr = (ze - H) * 3 / R, (zr - H) * 3 / R    # where eave line / ridge meet the roof
    b.append(P.poly([(x1, yf, zb), (x1, yf, ze), (x1, ye, ze)], '#e0d6c6'))            # right cheek
    b.append(P.poly([(x0, yf, zb), (x1, yf, zb), (x1, yf, ze), (xm, yf, zr), (x0, yf, ze)], wall))
    b.append(P.poly([(4.2, yf, zb + 0.15), (5.8, yf, zb + 0.15), (5.8, yf, ze - 0.15), (4.2, yf, ze - 0.15)], '#cfe6f2'))
    b.append(P.poly([(x0, yf, ze), (xm, yf, zr), (xm, yr, zr), (x0, ye, ze)], roofc))
    b.append(P.poly([(xm, yf, zr), (x1, yf, ze), (x1, ye, ze), (xm, yr, zr)], '#933b2e'))
    b.append(P.line((x0, yf, ze), (xm, yf, zr), cls='s') + P.line((xm, yf, zr), (x1, yf, ze), cls='s'))
    b.append(f'<g stroke="{trim}" stroke-width="4" stroke-linecap="round">'
             + P.line((x0 - 0.05, yf - 0.02, ze - 0.05), (xm, yf - 0.02, zr + 0.05), cls='')
             + P.line((xm, yf - 0.02, zr + 0.05), (x1 + 0.05, yf - 0.02, ze - 0.05), cls='') + '</g>')
    # front door + windows so it reads as a house
    for wx in (1.2, 7.4):
        b.append(P.poly([(wx, 0, 1.1), (wx + 1.4, 0, 1.1), (wx + 1.4, 0, 2.3), (wx, 0, 2.3)], '#cfe6f2'))
    b.append(P.poly([(4.5, 0, 0), (5.5, 0, 0), (5.5, 0, 2.2), (4.5, 0, 2.2)], '#9c7a54'))

    L = [('A', (8.5, 1.5, H + R / 2), (70, -60)),
         ('B', (6.2, 3, H + R), (40, -70)),
         ('C', (1.5, 0, H), (-50, -50)),
         ('D', ((x1 + xm) / 2, (ye + yr) / 2, (ze + zr) / 2), (130, -60)),
         ('E', (xm, yf, ze + 0.2), (10, -150)),
         ('F', (x0, yf, zb + 0.3), (-110, -40)),
         ('G', (xm, (yf + yr) / 2, zr), (40, -130)),
         ('H', (x1, (yf + ye) / 2 + 0.15, ze - 0.2), (110, 20)),
         ('I', (x0 + 0.6, yf, ze + 0.3), (-80, -110))]
    for letter, target, (dx, dy) in L:
        tx, ty = P(*target)
        b.append(label(letter, round(tx + dx), round(ty + dy), tx, ty))
    b.append(cap(330, 492, 'Roof identification'))
    return svg(660, 512, ''.join(b))


def _board(P, x=8, y=3, t=1):
    b = [P.poly([(0, 0, 0), (x, 0, 0), (x, 0, t), (0, 0, t)], '#e8cfa6'),
         P.poly([(x, 0, 0), (x, y, 0), (x, y, t), (x, 0, t)], '#d9b889'),
         P.poly([(0, 0, t), (x, 0, t), (x, y, t), (0, y, t)], '#f1ddb9')]
    for gy in (0.5, 1.1, 1.8, 2.4):
        b.append(P.line((0.3, gy, t), (x - 0.3, gy, t), cls='lead" stroke="#b38b56'))
    return b


def saw_cuts():
    P = Axo(70, 250, 44)
    b = _board(P, t=1.5)
    b.append(P.line((0, 1.5, 1.5), (8, 1.5, 1.5), cls='cut') + P.line((8, 1.5, 1.5), (8, 1.5, 0), cls='cut'))  # rip
    b.append(P.line((8, 0, 0.75), (8, 3, 0.75), cls='cut') + P.line((0, 0, 0.75), (8, 0, 0.75), cls='cut'))  # resaw
    b.append(P.line((3, 0, 1.5), (3, 3, 1.5), cls='cut') + P.line((3, 0, 1.5), (3, 0, 0), cls='cut'))        # crosscut
    b.append(label('A', 290, 40, *P(6, 1.5, 1.5)))
    b.append(label('B', 480, 250, *P(8, 2.2, 0.75)))
    b.append(label('C', 90, 90, *P(3, 2.2, 1.5)))
    ax, ay = P(0.5, -1.2, 0)
    bx, by = P(3.5, -1.2, 0)
    b.append(f'<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">'
             f'<path d="M0,0 L6,3 L0,6 z" fill="{INK}"/></marker></defs>'
             f'<line x1="{ax:.0f}" y1="{ay:.0f}" x2="{bx:.0f}" y2="{by:.0f}" stroke="{INK}" stroke-width="1.4" marker-end="url(#ar)"/>'
             + cap((ax + bx) / 2 - 8, (ay + by) / 2 + 20, 'grain direction', cls='t'))
    b.append(cap(260, 352, 'Saw cuts (red dashed lines)'))
    return svg(520, 366, ''.join(b))


def joinery():
    """Three boards: groove (A), dado (B), rabbet (C)."""
    top, side, end, low = '#f1ddb9', '#e8cfa6', '#d9b889', '#dcc39a'
    L, W, T, d = 6, 2.4, 1, 0.45
    out = []

    def grain(P, spans):
        for (x0, x1, y) in spans:
            out.append(P.line((x0, y, T), (x1, y, T), cls='lead" stroke="#b38b56'))

    # A: groove along the grain
    P = Axo(40, 150, 38)
    g0, g1 = 0.8, 1.4
    out += [P.poly([(0, g0, T - d), (L, g0, T - d), (L, g1, T - d), (0, g1, T - d)], low),
            P.poly([(0, g1, T - d), (L, g1, T - d), (L, g1, T), (0, g1, T)], end),
            P.poly([(0, 0, T), (L, 0, T), (L, g0, T), (0, g0, T)], top),
            P.poly([(0, g1, T), (L, g1, T), (L, W, T), (0, W, T)], top),
            P.poly([(0, 0, 0), (L, 0, 0), (L, 0, T), (0, 0, T)], side),
            P.poly([(L, 0, 0), (L, W, 0), (L, W, T), (L, g1, T), (L, g1, T - d), (L, g0, T - d), (L, g0, T), (L, 0, T)], end)]
    grain(P, [(0.2, L - 0.2, 0.4), (0.2, L - 0.2, 1.9)])
    out.append(label('A', 330, 40, *P(L - 1.5, g1, T - d / 2)))

    # B: dado across the grain
    P = Axo(40, 330, 38)
    d0, d1 = 2.6, 3.3
    out += [P.poly([(d0, 0, T - d), (d1, 0, T - d), (d1, W, T - d), (d0, W, T - d)], low),
            P.poly([(d0, 0, T - d), (d0, W, T - d), (d0, W, T), (d0, 0, T)], end),
            P.poly([(0, 0, T), (d0, 0, T), (d0, W, T), (0, W, T)], top),
            P.poly([(d1, 0, T), (L, 0, T), (L, W, T), (d1, W, T)], top),
            P.poly([(0, 0, 0), (L, 0, 0), (L, 0, T), (d1, 0, T), (d1, 0, T - d), (d0, 0, T - d), (d0, 0, T), (0, 0, T)], side),
            P.poly([(L, 0, 0), (L, W, 0), (L, W, T), (L, 0, T)], end)]
    grain(P, [(0.2, d0 - 0.1, 0.6), (0.2, d0 - 0.1, 1.6), (d1 + 0.1, L - 0.2, 0.6), (d1 + 0.1, L - 0.2, 1.6)])
    out.append(label('B', 330, 220, *P((d0 + d1) / 2, 1.6, T - d)))

    # C: rabbet along the edge
    P = Axo(40, 500, 38)
    r = 0.7
    out += [P.poly([(0, 0, T - d), (L, 0, T - d), (L, r, T - d), (0, r, T - d)], low),
            P.poly([(0, r, T - d), (L, r, T - d), (L, r, T), (0, r, T)], end),
            P.poly([(0, r, T), (L, r, T), (L, W, T), (0, W, T)], top),
            P.poly([(0, 0, 0), (L, 0, 0), (L, 0, T - d), (0, 0, T - d)], side),
            P.poly([(L, 0, 0), (L, W, 0), (L, W, T), (L, r, T), (L, r, T - d), (L, 0, T - d)], end)]
    grain(P, [(0.2, L - 0.2, 1.2), (0.2, L - 0.2, 1.9)])
    out.append(label('C', 330, 400, *P(L - 0.8, r / 2, T - d)))

    out.append(cap(200, 580, 'Wood joinery cuts (grain runs along each board’s length)'))
    return svg(400, 594, ''.join(out))


def glass_hardware():
    b = []
    glass = '#d6ebf5'
    metal = '#aab2bb'
    # A spigot: floor-mounted post clamping a glass balustrade panel
    b.append(line(20, 300, 150, 300, cls='s'))
    b.append(rect(55, 110, 60, 150, glass))
    b.append(rect(62, 250, 46, 42, metal) + rect(48, 292, 74, 8, metal))
    b.append(rect(80, 240, 10, 24, '#6b7280'))
    b.append(label('A', 140, 240, 108, 270))
    # B standoff: glass held off a wall
    b.append(f'<rect x="170" y="80" width="24" height="220" fill="url(#hatch)" class="s"/>')
    b.append(rect(236, 90, 10, 200, glass))
    for y in (120, 260):
        b.append(rect(194, y - 9, 42, 18, metal) + rect(246, y - 13, 12, 26, metal))
    b.append(label('B', 285, 110, 252, 120))
    # C clamp: glass edge gripped against a square post
    b.append(rect(320, 80, 26, 220, metal))
    b.append(rect(356, 100, 100, 180, glass))
    for y in (130, 240):
        b.append(rect(346, y - 12, 24, 24, '#8b949e'))
    b.append(label('C', 440, 70, 364, 118))
    # D patch fitting: L-shaped fitting on a frameless glass door corner, with pivot
    b.append(line(470, 300, 610, 300, cls='s'))
    b.append(rect(500, 80, 90, 206, glass))
    b.append(f'<path class="s" fill="{metal}" d="M496 250 H536 V262 H508 V290 H496 Z"/>')
    b.append(rect(512, 286, 8, 14, '#6b7280'))
    b.append(label('D', 600, 250, 522, 256))
    b.append('<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
             '<rect width="8" height="8" fill="#eee"/><line x1="0" y1="0" x2="0" y2="8" stroke="#888" stroke-width="2"/></pattern></defs>')
    b.append(cap(315, 330, 'Glass-fitting hardware (glass shown light blue)'))
    return svg(630, 344, ''.join(b))


def nailing():
    wood, wood2 = '#ecd3a8', '#dcbd8a'
    nail = f'stroke="{INK}" stroke-width="3" stroke-linecap="round"'
    b = []

    def head(x, y, ang):
        a = math.radians(ang + 90)
        return line(x - 6 * math.cos(a), y - 6 * math.sin(a), x + 6 * math.cos(a), y + 6 * math.sin(a), cls='s" stroke-width="3')

    # Face nailing: board laid flat on another, nailed straight through the face
    b.append(rect(20, 130, 140, 28, wood) + rect(20, 158, 140, 28, wood2))
    b.append(f'<line x1="90" y1="120" x2="90" y2="176" {nail}/>' + head(90, 120, 90))
    b.append(cap(90, 222, 'Face nailing', cls='t'))
    # End nailing: through a plate into the END of a stud
    b.append(rect(200, 60, 140, 26, wood) + rect(255, 86, 30, 110, wood2))
    b.append(f'<line x1="270" y1="50" x2="270" y2="120" {nail}/>' + head(270, 50, 90))
    b.append(cap(270, 222, 'End nailing', cls='t'))
    # Toe nailing: slanted through the stud side into the plate
    b.append(rect(380, 170, 140, 26, wood) + rect(435, 60, 30, 110, wood2))
    b.append(f'<line x1="428" y1="128" x2="458" y2="184" {nail}/>' + head(428, 128, 62))
    b.append(cap(450, 222, 'Toe nailing', cls='t'))
    # Blind nailing: through the tongue, hidden by the next board
    b.append(rect(560, 172, 180, 20, '#cfd5db'))
    b.append(f'<path class="s" fill="{wood}" d="M560 140 H650 V150 H664 V162 H650 V172 H560 Z"/>')
    b.append(f'<path class="s" fill="{wood2}" d="M676 140 H740 V172 H676 V162 H690 V150 H676 Z"/>')
    b.append(f'<line x1="656" y1="148" x2="636" y2="188" {nail}/>' + head(656, 148, 117))
    b.append(cap(708, 132, 'next board', cls='t'))
    b.append(cap(650, 222, 'Blind nailing', cls='t'))
    b.append(cap(380, 258, 'Nailing methods'))
    return svg(760, 272, ''.join(b))


def site_layout():
    b = []
    b.append(rect(20, 360, 620, 50, '#d0d4d8') + cap(330, 392, 'ROAD', cls='t'))
    b.append(f'<rect x="40" y="30" width="580" height="320" fill="#fafafa" stroke="{INK}" stroke-width="2" stroke-dasharray="10 5"/>')
    b.append(rect(90, 345, 70, 10, '#fff', 'stroke-width="0"') + cap(125, 338, 'GATE', cls='t'))
    b.append(rect(250, 80, 230, 190, '#cfd5db'))
    b.append(cap(365, 170, '8-storey building', cls='t') + cap(365, 186, 'under construction', cls='t'))

    def zone(letter, x, y, w, h):
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="#fff" stroke="{INK}" stroke-width="1.4" stroke-dasharray="4 3"/>'
                f'<text class="L" x="{x + w / 2}" y="{y + h / 2 + 6}" text-anchor="middle">{letter}</text>')
    b.append(zone('A', 60, 255, 90, 60))     # near the gate, clear of the building
    b.append(zone('B', 60, 170, 70, 55))     # beside A, fenced and watched
    b.append(zone('C', 170, 150, 55, 90))    # next to the building, off the gate road
    b.append(zone('D', 360, 290, 60, 45))    # building edge facing the road
    b.append(zone('E', 510, 150, 50, 50))    # tight to the building's long side
    b.append(cap(330, 432, 'Site layout (plan)'))
    return svg(660, 446, ''.join(b))


def furring():
    """Eight furring / framing profiles in cross-section."""
    b = []
    m = f'fill="none" stroke="{INK}" stroke-width="3" stroke-linejoin="round"'
    shapes = {
        'A': 'M-40,40 H-22 V0 H22 V40 H40',                          # hat channel
        'B': None,                                                    # wood furring strip
        'C': 'M-40,40 H-14 V0 H30 M-14,0 V14',                       # resilient channel
        'D': None,                                                    # adjustable / telescoping
        'E': 'M-26,0 V40 H26',                                        # angle
        'F': 'M-34,0 H-6 V40 H22',                                    # Z channel
        'G': 'M-30,0 H20 V40 H-30',                                   # J/U track
        'H': 'M-14,6 V0 H-26 V40 H26 V0 H14 V6',                      # lipped C channel
    }
    for i, (k, d) in enumerate(shapes.items()):
        cx, cy = 80 + (i % 4) * 150, 50 + (i // 4) * 150
        if k == 'B':
            b.append(rect(cx - 22, cy + 8, 44, 30, '#ecd3a8'))
        elif k == 'D':
            b.append(f'<path transform="translate({cx},{cy})" {m} d="M-24,40 V6 H24 V40"/>'
                     f'<path transform="translate({cx},{cy})" {m} d="M-16,52 V16 H16 V52"/>'
                     f'<line x1="{cx - 32}" y1="{cy + 30}" x2="{cx + 32}" y2="{cy + 30}" stroke="#6b7280" stroke-width="3"/>')
        else:
            b.append(f'<path transform="translate({cx},{cy})" {m} d="{d}"/>')
        b.append(f'<text class="L" x="{cx}" y="{cy + 88}" text-anchor="middle">{k}</text>')
    b.append(cap(305, 332, 'Furring and framing profiles (cross-sections)'))
    return svg(610, 346, ''.join(b))


FIGURES = {
    'curtain-wall': curtain_wall, 'window-frame': window_frame, 'slab-bands': slab_bands,
    'roof-parts': roof, 'saw-cuts': saw_cuts, 'wood-joinery': joinery,
    'glass-hardware': glass_hardware, 'nailing-methods': nailing,
    'site-layout': site_layout, 'furring-profiles': furring,
}


def render(name, s):
    w = int(s.split('width="')[1].split('"')[0])
    h = int(s.split('height="')[1].split('"')[0])
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False, encoding='utf-8') as f:
        f.write(s)
    out = os.path.abspath(os.path.join(OUT, name + '.png'))
    subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=2', f'--window-size={w},{h}',
                    f'--screenshot={out}', 'file:///' + f.name.replace('\\', '/')],
                   check=True, capture_output=True)
    os.unlink(f.name)
    assert os.path.getsize(out) > 2000, name


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, fn in FIGURES.items():
        render(name, fn())
        print('wrote', name)
