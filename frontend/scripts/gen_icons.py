"""Generate Supermind PWA icons: a graphite tile with a periwinkle
neural-node glyph. Run: python3 scripts/gen_icons.py"""
from PIL import Image, ImageDraw
import os, math

BG = (14, 17, 22)
TILE = (22, 27, 34)
ACCENT = (139, 124, 246)
ACCENT_DIM = (139, 124, 246, 70)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

def draw_mark(size, pad_ratio, rounded=True, bg=BG):
    S = size * 4  # supersample
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(S * 0.22)
    if rounded:
        d.rounded_rectangle([0, 0, S, S], radius=r, fill=bg)
    else:
        d.rectangle([0, 0, S, S], fill=bg)

    cx = cy = S / 2
    R = S * (0.5 - pad_ratio)

    # symmetric constellation: 6 satellites on a ring around a core,
    # each linked to the core (a clean "mind hub" mark)
    nodes = []
    for i in range(6):
        ang = math.radians(90 + i * 60)   # start at top, evenly spaced
        rad = R * 0.72
        x = cx + math.cos(ang) * rad
        y = cy - math.sin(ang) * rad
        nodes.append((x, y))

    lw = max(2, S // 200)
    # ring filaments (satellite to satellite)
    for i in range(len(nodes)):
        x1, y1 = nodes[i]
        x2, y2 = nodes[(i + 1) % len(nodes)]
        d.line([x1, y1, x2, y2], fill=ACCENT_DIM, width=lw)
    # spokes (satellite to core)
    for (x, y) in nodes:
        d.line([x, y, cx, cy], fill=ACCENT_DIM, width=lw)

    # central core with glow ring
    core = R * 0.17
    glow = R * 0.31
    d.ellipse([cx - glow, cy - glow, cx + glow, cy + glow],
              outline=ACCENT, width=max(2, S // 190))
    d.ellipse([cx - core, cy - core, cx + core, cy + core], fill=ACCENT)

    # satellite nodes
    for (x, y) in nodes:
        nr = R * 0.075
        d.ellipse([x - nr, y - nr, x + nr, y + nr], fill=ACCENT)

    return img.resize((size, size), Image.LANCZOS)

# standard icons
draw_mark(192, 0.20).save(os.path.join(OUT, "icon-192.png"))
draw_mark(512, 0.20).save(os.path.join(OUT, "icon-512.png"))
# maskable needs generous safe-area padding + full-bleed bg
draw_mark(512, 0.30, bg=BG).save(os.path.join(OUT, "icon-maskable-512.png"))
# apple touch (no transparency, filled tile)
draw_mark(180, 0.20).save(os.path.join(OUT, "apple-touch-icon.png"))

# simple SVG favicon
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect width="24" height="24" rx="5.3" fill="#0e1116"/>
<circle cx="12" cy="12" r="1.7" fill="#8b7cf6"/>
<circle cx="12" cy="12" r="3.4" fill="none" stroke="#8b7cf6" stroke-width="0.9"/>
<g fill="#8b7cf6">
<circle cx="6.5" cy="8" r="0.9"/><circle cx="6" cy="14.5" r="0.9"/>
<circle cx="17.5" cy="8" r="0.9"/><circle cx="18" cy="14.5" r="0.9"/>
<circle cx="9" cy="5.5" r="0.9"/><circle cx="15" cy="18.5" r="0.9"/>
</g>
<g stroke="#8b7cf6" stroke-width="0.6" opacity="0.45">
<path d="M6.5 8L12 12M6 14.5L12 12M17.5 8L12 12M18 14.5L12 12M9 5.5L12 12M15 18.5L12 12"/>
</g></svg>'''
with open(os.path.join(OUT, "icon.svg"), "w") as f:
    f.write(svg)

print("icons written to", os.path.abspath(OUT))
print(os.listdir(OUT))
