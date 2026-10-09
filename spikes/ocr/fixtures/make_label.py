# Renders the synthetic medicine-box label used by the CI model test
# (ocr.model.test.ts). Invented text, not a real product or patient.
# Font: Pillow's bundled default (Aileron Regular, CC0). Run with Pillow 10.1+:
#   python3 make_label.py  ->  label.ppm (binary PPM, read without any library)
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LINES = ["PARACETAMOL 500 mg", "LOT: A23B456", "EXP: 06/2027", "MFG: 01/2025"]

image = Image.new("RGB", (480, 200), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=30)
for i, line in enumerate(LINES):
    draw.text((24, 16 + i * 44), line, fill="black", font=font)
image.save(Path(__file__).with_name("label.ppm"))
