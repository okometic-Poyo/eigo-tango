#!/usr/bin/env python3
"""サンプル素材の一括生成スクリプト（開発用・Mac専用）

- 音源: macOS の say コマンド(Samantha) で読み上げ → afconvert で .m4a に変換
  → content/audio/<id>.m4a
- イラスト: 絵文字を 512x512 PNG にレンダリングした仮画像
  → content/images/<id>.png

正式な素材(mp3/png)を同じIDで置けば、この仮素材は上書き・置き換えできます。
（アプリは <id>.mp3 を先に探し、無ければ <id>.m4a を再生します）

使い方:  python3 tools/generate_assets.py
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
AUDIO_DIR = CONTENT / "audio"
IMAGE_DIR = CONTENT / "images"

VOICE = "Samantha"   # 米国英語の女性ボイス
RATE = "150"         # 少しゆっくりめ

# 単語ID → 仮イラスト用の絵文字（複数指定可）
EMOJI = {
    "apple": "🍎", "milk": "🥛", "egg": "🥚", "bread": "🍞",
    "i-like-apples": "🙂💕🍎",
    "dog": "🐶", "cat": "🐱", "elephant": "🐘", "monkey": "🐵",
    "i-see-a-big-elephant": "👀🐘",
    "book": "📖", "pen": "🖊️", "pencil": "✏️", "bag": "🎒",
    "this-is-my-book": "🙋📖",
    "banana": "🍌", "orange": "🍊", "grape": "🍇", "peach": "🍑", "strawberry": "🍓",
    "i-want-a-banana": "🙏🍌",
    "red": "❤️", "blue": "💙", "yellow": "💛", "green": "💚", "pink": "💗",
    "what-color-is-it": "❓🎨",
    "one": "⭐", "two": "⭐⭐", "three": "⭐⭐⭐",
    "four": "⭐⭐\n⭐⭐", "five": "⭐⭐⭐\n⭐⭐",
    "how-many-apples": "🍎❓",
    "six": "⭐⭐⭐\n⭐⭐⭐", "seven": "⭐⭐⭐⭐\n⭐⭐⭐",
    "eight": "⭐⭐⭐⭐\n⭐⭐⭐⭐", "nine": "⭐⭐⭐\n⭐⭐⭐\n⭐⭐⭐",
    "ten": "⭐⭐⭐⭐⭐\n⭐⭐⭐⭐⭐",
    "how-old-are-you": "🎂❓",
    "father": "👨", "mother": "👩", "brother": "👦", "sister": "👧", "baby": "👶",
    "she-is-my-mother": "👧💕👩",
    "eye": "👁️", "ear": "👂", "nose": "👃", "mouth": "👄", "hand": "✋",
    "touch-your-nose": "👉👃",
    "bird": "🐦", "rabbit": "🐰", "bear": "🐻", "lion": "🦁", "pig": "🐷",
    "a-rabbit-can-jump": "🐰⬆️",
    "sun": "☀️", "rain": "🌧️", "snow": "❄️", "cloud": "☁️", "umbrella": "☂️",
    "it-is-sunny-today": "☀️😊",
    "car": "🚗", "bus": "🚌", "train": "🚃", "bike": "🚲", "boat": "⛵",
    "i-go-by-bus": "🙂🚌",
    "table": "🍽️", "chair": "🪑", "bed": "🛏️", "door": "🚪", "window": "🪟",
    "the-cat-is-under-the-table": "🐱⬇️🍽️",
    "hat": "👒", "cap": "🧢", "shirt": "👕", "shoes": "👟", "socks": "🧦",
    "i-wear-a-new-cap": "🙂🧢",
    "soccer": "⚽", "baseball": "⚾", "tennis": "🎾", "basketball": "🏀",
    "lets-play-soccer": "⚽😆",
    "tree": "🌳", "flower": "🌼", "mountain": "⛰️", "river": "🏞️", "sea": "🌊",
    "look-at-the-mountain": "👀⛰️",
    "school": "🏫", "park": "🛝", "station": "🚉", "shop": "🏪", "zoo": "🦓",
    "where-is-the-station": "❓🚉",
    "rice": "🍚", "fish": "🐟", "meat": "🍖", "soup": "🍲", "cake": "🍰",
    "i-am-hungry": "😋🍽️",
    "juice": "🧃", "water": "💧", "tea": "🍵", "ice-cream": "🍦", "candy": "🍬",
    "juice-please": "🧃🙏",
    "morning": "🌅", "night": "🌃", "breakfast": "🍳", "lunch": "🍱", "dinner": "🍽️",
    "good-morning": "🌅👋", "good-night": "🌙😴",
    "spring": "🌸", "summer": "🌻", "fall": "🍁", "winter": "⛄", "star": "⭐",
    "it-is-hot-in-summer": "🥵☀️",
    "piano": "🎹", "guitar": "🎸", "music": "🎵", "song": "🎤", "drum": "🥁",
    "i-play-the-piano": "🙂🎹",
    "friend": "🧑‍🤝‍🧑", "teacher": "👩‍🏫",
    "thank-you": "🙏😊", "what-is-your-name": "❓🙂",
}

BG_COLORS = [
    (255, 243, 224), (232, 245, 233), (227, 242, 253),
    (252, 228, 236), (255, 249, 196), (237, 231, 246),
]


def load_emoji_font():
    path = "/System/Library/Fonts/Apple Color Emoji.ttc"
    for size in (160, 137, 96, 64):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise RuntimeError("Apple Color Emoji フォントを読み込めませんでした")


def make_image(word_id: str, emoji: str, font) -> None:
    out = IMAGE_DIR / f"{word_id}.png"
    if out.exists():  # 手動で用意した画像は上書きしない
        print(f"  image: {out.name} (既存のためスキップ)")
        return
    canvas = Image.new("RGBA", (512, 512), BG_COLORS[hash(word_id) % len(BG_COLORS)])

    # 絵文字を透明キャンバスに描いてから、中央に拡大配置する（\n で複数行可）
    tmp = Image.new("RGBA", (1400, 900), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tmp)
    draw.multiline_text((10, 10), emoji, font=font, embedded_color=True, spacing=20)
    bbox = tmp.getbbox()
    if not bbox:
        raise RuntimeError(f"絵文字を描画できませんでした: {word_id}")
    art = tmp.crop(bbox)

    max_w, max_h = 420, 340
    scale = min(max_w / art.width, max_h / art.height)
    art = art.resize((int(art.width * scale), int(art.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(art, ((512 - art.width) // 2, (512 - art.height) // 2))
    canvas.convert("RGB").save(out, "PNG")
    print(f"  image: {out.name}")


def make_audio(word_id: str, text: str) -> None:
    out = AUDIO_DIR / f"{word_id}.m4a"
    if out.exists() or (AUDIO_DIR / f"{word_id}.mp3").exists():  # 手動音源は上書きしない
        print(f"  audio: {word_id} (既存のためスキップ)")
        return
    aiff = Path(f"/tmp/tango_{word_id}.aiff")
    subprocess.run(
        ["say", "-v", VOICE, "-r", RATE, "-o", str(aiff), text],
        check=True,
    )
    subprocess.run(
        ["afconvert", str(aiff), "-f", "m4af", "-d", "aac", str(out)],
        check=True, capture_output=True,
    )
    aiff.unlink(missing_ok=True)
    print(f"  audio: {out.name}")


def main() -> None:
    words = json.loads((CONTENT / "words.json").read_text())["words"]
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    font = load_emoji_font()

    missing_emoji = []
    for w in words:
        print(w["id"])
        # tts フィールドがあれば読み上げにはそちらを使う（例: "I" → "eye"）
        make_audio(w["id"], w.get("tts") or w["text"])
        if w["category"] != "function-word":
            emoji = EMOJI.get(w["id"])
            if emoji:
                make_image(w["id"], emoji, font)
            else:
                missing_emoji.append(w["id"])

    if missing_emoji:
        print("\n[注意] 絵文字が未定義のためイラスト未生成:", ", ".join(missing_emoji))
        sys.exit(1)
    print("\n完了しました。")


if __name__ == "__main__":
    main()
