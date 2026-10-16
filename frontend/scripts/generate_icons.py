# Gera os ícones PNG dos 3 apps (PWA, Apple, favicon) e recorta as logos.
# Rodar uma vez: python -I frontend/scripts/generate_icons.py  (precisa de Pillow)
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "public"
BRAND, ICONS = ROOT / "brand", ROOT / "icons"
NAVY, TEAL, WHITE = (0, 13, 48, 255), (0, 151, 178, 255), (255, 255, 255, 255)
S = 1024  # desenha grande e reduz (antialias)


def trim(name):
    im = Image.open(BRAND / f"{name}.png").convert("RGBA")
    im.crop(im.getbbox()).save(BRAND / f"{name}-trim.png")


def canvas():
    return Image.new("RGBA", (S, S), NAVY)


def further(art_scale):
    im = canvas()
    arrow = Image.open(BRAND / "further-arrow-light.png").convert("RGBA")
    arrow = arrow.crop(arrow.getbbox())
    w = int(S * art_scale)
    h = int(arrow.height * w / arrow.width)
    arrow = arrow.resize((w, h), Image.LANCZOS)
    im.alpha_composite(arrow, ((S - w) // 2 + int(S * 0.03), (S - h) // 2))
    return im


def caixa(art_scale):
    im = canvas()
    d = ImageDraw.Draw(im)
    w = S * art_scale
    x0, y0 = (S - w) / 2, (S - w * 0.8) / 2 - S * 0.04
    x1, y1 = x0 + w, y0 + w * 0.72
    d.rounded_rectangle([x0, y0, x1, y1], radius=w * 0.2, fill=TEAL)
    d.polygon([(x0 + w * 0.2, y1 - 2), (x0 + w * 0.18, y1 + w * 0.2), (x0 + w * 0.42, y1 - 2)], fill=TEAL)
    r = w * 0.06
    cy = (y0 + y1) / 2
    for i in (-1, 0, 1):
        cx = S / 2 + i * w * 0.22
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    return im


def namesa(art_scale):
    im = canvas()
    d = ImageDraw.Draw(im)
    w = S * art_scale
    c, R = S / 2, w * 0.3
    d.ellipse([c - R, c - R, c + R, c + R], fill=TEAL)
    r2 = R * 0.68
    d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=WHITE, width=int(w * 0.035))
    t = w * 0.045
    # garfo (esquerda) e faca (direita)
    fx = c - R - w * 0.12
    d.rounded_rectangle([fx - t / 2, c - R, fx + t / 2, c + R], radius=t / 2, fill=WHITE)
    for dx in (-t * 1.6, 0, t * 1.6):
        d.rounded_rectangle([fx + dx - t / 4, c - R, fx + dx + t / 4, c - R * 0.45], radius=t / 4, fill=WHITE)
    d.rounded_rectangle([fx - t * 1.85, c - R * 0.5, fx + t * 1.85, c - R * 0.38], radius=t / 3, fill=WHITE)
    kx = c + R + w * 0.12
    d.rounded_rectangle([kx - t / 2, c - R * 0.1, kx + t / 2, c + R], radius=t / 2, fill=WHITE)
    d.pieslice([kx - t * 1.4, c - R, kx + t * 0.6, c + R * 0.2], 270, 90, fill=WHITE)
    return im


def save(img, name, size, rounded=False):
    out = img.resize((size, size), Image.LANCZOS)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=size * 0.22, fill=255)
        out.putalpha(mask)
    out.save(ICONS / name)


def main():
    ICONS.mkdir(exist_ok=True)
    for n in ["further-horizontal-dark", "further-horizontal-light", "further-vertical-dark",
              "further-vertical-light", "further-arrow-dark", "further-arrow-light"]:
        trim(n)
    for app, draw in {"further": further, "caixa": caixa, "namesa": namesa}.items():
        normal, maskable = draw(0.62), draw(0.5)  # maskable: arte dentro do círculo seguro (80%)
        save(normal, f"{app}-192.png", 192, rounded=True)
        save(normal, f"{app}-512.png", 512, rounded=True)
        save(maskable, f"{app}-maskable-512.png", 512)
        save(normal, f"{app}-apple-180.png", 180)  # iOS arredonda sozinho e não aceita transparência
        save(normal, f"{app}-favicon-32.png", 32, rounded=True)


if __name__ == "__main__":
    main()
