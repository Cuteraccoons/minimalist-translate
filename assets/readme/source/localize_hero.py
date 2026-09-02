#!/usr/bin/env python3
"""Build the English and Japanese README heroes from the Chinese master artwork."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "zh-CN" / "hero.png"
OUTPUTS = {
    "en": ROOT / "en" / "hero.png",
    "ja": ROOT / "ja" / "hero.png",
}

FONT_EN_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_EN = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_JA_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc"
FONT_JA = "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"

INK = (70, 50, 35)
CARD_FILL = (253, 246, 235)
CARD_LINE = (218, 201, 176)
ICON_INK = (192, 170, 132)

CARD_ORIGINS = (
    (139, 299), (501, 299), (864, 299),
    (139, 421), (501, 421), (864, 421),
    (139, 544), (501, 544), (864, 544),
)

COPY = {
    "en": {
        "title": "Minimalist Translate",
        "tagline": ("Simple lookup", "Elegant reading"),
        "cards": (
            "Configurable AI", "Image translation", "Local dictionaries",
            "Vocabulary", "Reader mode", "Floating panel",
            "Bilingual view", "Replace original", "Side-by-side",
        ),
        "title_font": FONT_EN_BOLD,
        "body_font": FONT_EN,
        "title_size": 122,
        "tagline_size": 43,
        "card_size": 28,
    },
    "ja": {
        "title": "極簡翻訳",
        "tagline": ("かんたんに調べる", "静かに読む"),
        "cards": (
            "AI を設定", "画像翻訳", "ローカル辞書",
            "単語帳", "リーダー", "フローティング",
            "原文・訳文", "原文を置換", "左右対訳",
        ),
        "title_font": FONT_JA_BOLD,
        "body_font": FONT_JA,
        "title_size": 178,
        "tagline_size": 43,
        "card_size": 31,
    },
}


def clear_left_panel(image: Image.Image) -> None:
    """Remove the Chinese copy while retaining the illustration on the right."""
    source = np.asarray(image.convert("RGB"), dtype=np.float32)
    width = 1270
    rows = source[:, :72, :].mean(axis=1)
    rng = np.random.default_rng(20260829)
    paper = np.repeat(rows[:, None, :], width, axis=1)
    paper += rng.normal(0.0, 0.34, paper.shape)
    patch = Image.fromarray(np.clip(paper, 0, 255).astype(np.uint8), "RGB")
    image.paste(patch, (0, 0))


def draw_icon(draw: ImageDraw.ImageDraw, index: int, origin: tuple[int, int]) -> None:
    """Draw the nine project feature icons with one consistent line language."""
    x, y = origin
    c = ICON_INK
    if index == 0:
        draw.polygon([(x + 26, y), (x + 32, y + 16), (x + 48, y + 22), (x + 32, y + 28),
                      (x + 26, y + 44), (x + 20, y + 28), (x + 4, y + 22), (x + 20, y + 16)], fill=c)
        draw.polygon([(x + 53, y + 5), (x + 57, y + 14), (x + 66, y + 18), (x + 57, y + 22),
                      (x + 53, y + 31), (x + 49, y + 22), (x + 40, y + 18), (x + 49, y + 14)], fill=c)
        draw.ellipse((x + 39, y + 36, x + 47, y + 44), fill=c)
    elif index == 1:
        draw.rounded_rectangle((x + 3, y + 3, x + 58, y + 45), radius=3, outline=c, width=5)
        draw.ellipse((x + 43, y + 9, x + 52, y + 18), fill=c)
        draw.polygon([(x + 8, y + 39), (x + 22, y + 24), (x + 31, y + 33), (x + 38, y + 26), (x + 55, y + 43)], fill=c)
    elif index == 2:
        draw.rounded_rectangle((x + 4, y + 1, x + 56, y + 47), radius=5, fill=c)
        draw.rectangle((x + 14, y + 12, x + 47, y + 16), fill=CARD_FILL)
        draw.rectangle((x + 14, y + 23, x + 47, y + 27), fill=CARD_FILL)
        draw.rectangle((x + 14, y + 34, x + 42, y + 38), fill=CARD_FILL)
        draw.rectangle((x + 4, y + 43, x + 62, y + 49), fill=c)
    elif index == 3:
        draw.rounded_rectangle((x + 11, y + 1, x + 56, y + 50), radius=5, fill=c)
        for offset in (8, 17, 26, 35):
            draw.rectangle((x + 3, y + offset, x + 15, y + offset + 4), fill=c)
        draw.rectangle((x + 22, y + 9, x + 46, y + 14), fill=CARD_FILL)
    elif index == 4:
        draw.rounded_rectangle((x + 3, y + 1, x + 60, y + 50), radius=5, fill=c)
        draw.rectangle((x + 12, y + 7, x + 52, y + 43), fill=CARD_FILL)
        draw.rectangle((x + 3, y + 46, x + 64, y + 51), fill=c)
    elif index == 5:
        draw.rounded_rectangle((x + 4, y + 8, x + 56, y + 42), radius=15, outline=c, width=6)
        draw.line((x + 37, y + 10, x + 19, y + 40), fill=c, width=6)
    elif index == 6:
        draw.rounded_rectangle((x + 1, y + 3, x + 37, y + 37), radius=6, fill=c)
        draw.text((x + 7, y + 3), "中", font=ImageFont.truetype(FONT_JA_BOLD, 22), fill=CARD_FILL)
        draw.rounded_rectangle((x + 29, y + 20, x + 65, y + 54), radius=6, fill=c)
        draw.text((x + 38, y + 19), "A", font=ImageFont.truetype(FONT_EN_BOLD, 22), fill=CARD_FILL)
    elif index == 7:
        draw.rounded_rectangle((x + 3, y + 2, x + 25, y + 24), radius=4, outline=c, width=4)
        draw.rounded_rectangle((x + 39, y + 30, x + 61, y + 52), radius=4, outline=c, width=4)
        draw.line((x + 29, y + 7, x + 49, y + 7, x + 49, y + 22), fill=c, width=4)
        draw.polygon([(x + 43, y + 17), (x + 55, y + 17), (x + 49, y + 25)], fill=c)
        draw.line((x + 35, y + 47, x + 15, y + 47, x + 15, y + 32), fill=c, width=4)
        draw.polygon([(x + 9, y + 37), (x + 21, y + 37), (x + 15, y + 29)], fill=c)
    else:
        draw.rounded_rectangle((x + 3, y + 2, x + 28, y + 53), radius=4, fill=c)
        draw.rounded_rectangle((x + 35, y + 2, x + 60, y + 53), radius=4, fill=c)


def fitted_font(path: str, text: str, max_size: int, max_width: int) -> ImageFont.FreeTypeFont:
    size = max_size
    probe = Image.new("RGB", (1, 1))
    draw = ImageDraw.Draw(probe)
    while size > 16:
        font = ImageFont.truetype(path, size)
        box = draw.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font
        size -= 1
    return ImageFont.truetype(path, size)


def draw_centered(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str,
                  font: ImageFont.FreeTypeFont, fill: tuple[int, int, int]) -> None:
    x0, y0, x1, y1 = box
    bounds = draw.textbbox((0, 0), text, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    x = x0 + ((x1 - x0) - width) / 2 - bounds[0]
    y = y0 + ((y1 - y0) - height) / 2 - bounds[1]
    draw.text((round(x), round(y)), text, font=font, fill=fill)


def build(locale: str) -> None:
    config = COPY[locale]
    image = Image.open(MASTER).convert("RGB")
    clear_left_panel(image)
    draw = ImageDraw.Draw(image)

    for index, (card_x, card_y) in enumerate(CARD_ORIGINS):
        draw.rounded_rectangle(
            (card_x, card_y, card_x + 329, card_y + 92),
            radius=21,
            fill=CARD_FILL,
            outline=CARD_LINE,
            width=2,
        )
        draw_icon(draw, index, (card_x + 25, card_y + 22))

    title_font = fitted_font(config["title_font"], config["title"], config["title_size"], 720)
    draw_centered(draw, (92, 58, 812, 225), config["title"], title_font, INK)

    tagline_font = ImageFont.truetype(config["body_font"], config["tagline_size"])
    draw.text((866, 106), config["tagline"][0], font=tagline_font, fill=INK)
    draw.text((866, 171), config["tagline"][1], font=tagline_font, fill=INK)

    for origin, label in zip(CARD_ORIGINS, config["cards"]):
        card_x, card_y = origin
        font = fitted_font(config["body_font"], label, config["card_size"], 190)
        draw_centered(draw, (card_x + 112, card_y + 12, card_x + 313, card_y + 81), label, font, INK)

    output = OUTPUTS[locale]
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, format="PNG", optimize=True)


if __name__ == "__main__":
    for language in OUTPUTS:
        build(language)
