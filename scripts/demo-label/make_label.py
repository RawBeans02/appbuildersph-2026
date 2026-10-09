# Renders the synthetic doxycycline label the presenter scans in the demo's
# stock step (src/data/seed/demoLabel.ts holds the same values). Invented text:
# not a real medicine, product, brand or company, and plainly marked as such.
# Large, straight, black on white, so the phone's OCR can read it off a laptop
# screen or a printout.
#
# Font: Pillow's bundled default, Aileron Regular (CC0). Needs Pillow 10.1+.
#   python3 scripts/demo-label/make_label.py [out.png]
#   (default: docs/demo/label-doxy-24A.png)
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WARNING = "DEMO · NOT A REAL MEDICINE · SAMPLE DATA"
# (text, font size); the drug line first, then lot, expiry and manufacture.
LINES = [
    ("Doxycycline 100 mg capsules", 66),
    ("LOT: DEMO-LOT-24A", 62),
    ("EXP: 11/2026", 62),
    ("MFG: 05/2025", 62),
]

WIDTH, HEIGHT = 1200, 760
MARGIN = 60
BLACK, WHITE = 0, 255

out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("docs/demo/label-doxy-24A.png")

image = Image.new("L", (WIDTH, HEIGHT), WHITE)
draw = ImageDraw.Draw(image)
draw.rectangle((12, 12, WIDTH - 13, HEIGHT - 13), outline=BLACK, width=6)


def text(y: int, line: str, size: int, center: bool = False) -> None:
    font = ImageFont.load_default(size=size)
    left, _, right, _ = draw.textbbox((0, 0), line, font=font)
    width = right - left
    if width > WIDTH - 2 * MARGIN:
        sys.exit(f"'{line}' is {width} px wide; it must fit in {WIDTH - 2 * MARGIN} px")
    x = (WIDTH - width) // 2 if center else MARGIN
    draw.text((x, y), line, fill=BLACK, font=font)


# The warning at the top and the bottom, each set off by a rule.
text(44, WARNING, 40, center=True)
draw.line((MARGIN, 112, WIDTH - MARGIN, 112), fill=BLACK, width=4)
for i, (line, size) in enumerate(LINES):
    text(150 + i * 110, line, size)
draw.line((MARGIN, HEIGHT - 116, WIDTH - MARGIN, HEIGHT - 116), fill=BLACK, width=4)
text(HEIGHT - 92, WARNING, 40, center=True)

out.parent.mkdir(parents=True, exist_ok=True)
image.save(out, optimize=True)
print(f"wrote {out} ({WIDTH}x{HEIGHT}, {out.stat().st_size} bytes)")
