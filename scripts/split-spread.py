#!/usr/bin/env python3
"""見開き画像を左右に分割するスクリプト。

巻フォルダ内のページ画像を順番に処理する:
  - 1ページ目 (先頭): 表紙扱い。左右の余白だけ自動カット (分割なし)
  - 2ページ目以降: 左右の余白を自動カット後、左右に分割
                  漫画読み順 (右綴じ) なので 右半分 → 左半分 の順で出力

入力フォルダ:
  <vol_dir>/001.jpg, 002.jpg, ...

出力フォルダ:
  <vol_dir>/<vol_dir name>/001.jpg, ...
  例: /path/to/02/02/001.jpg, 002.jpg, ...
  ※ 原本はそのまま残る。出力サブフォルダは「親フォルダと同名 (巻数)」。

余白判定 (黒余白特化):
  各列の平均輝度を測り、`black_max` 以下なら "黒余白" 列とみなす。
  左端 / 右端 から連続して黒余白の列を数えて、その幅を返す。
  黒の中に多少の圧縮ノイズ (薄い灰の散在) があっても平均で吸収される。

依存: Pillow (pip install Pillow)

Usage:
  python3 split-spread.py "/path/to/volume/01"
  python3 split-spread.py "/path/to/volume/02" "/path/to/volume/03"

オプション:
  --black-max N     余白判定: 各列の平均輝度がこの値以下なら "黒余白" (default 60)
  --min-margin N    検出する最小余白幅 (px, default 5)
  --max-margin N    検出する最大余白幅 (px, default 1200)
  --jpeg-quality N  出力 JPEG 品質 (default 92)
  --dry-run         実際にファイルを書かず、計算結果のみ表示
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.stderr.write("Pillow が必要です:  pip3 install Pillow\n")
    sys.exit(1)

IMG_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")


def list_images(d: Path) -> list[Path]:
    return sorted(
        [p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXTS],
        key=lambda p: p.name.lower(),
    )


def detect_horizontal_margins(
    img: Image.Image,
    black_max: int,
    min_margin: int,
    max_margin: int,
) -> tuple[int, int]:
    """画像の左右にある「黒余白」の幅を検出する。

    各列について行方向の平均輝度を計算し、`black_max` 以下なら
    "黒余白" 列とみなす。左端 / 右端 から連続している黒余白の幅を返す。
    平均を使うため、黒の中に多少の圧縮ノイズが散っていても吸収できる。
    """
    gray = img.convert("L")
    w, h = gray.size
    if w < 2 or h < 2:
        return 0, 0
    px = gray.load()

    # 行サンプル (最大 200 行)
    step = max(1, h // 200)
    sampled_rows = list(range(0, h, step))
    nrows = len(sampled_rows)
    if nrows == 0:
        return 0, 0

    col_mean = [0.0] * w
    for x in range(w):
        s = 0
        for y in sampled_rows:
            s += px[x, y]
        col_mean[x] = s / nrows

    def is_black(x: int) -> bool:
        return col_mean[x] <= black_max

    # 左端から連続して黒
    left = 0
    for x in range(w):
        if is_black(x):
            left += 1
        else:
            break
    # 右端から連続して黒
    right = 0
    for x in range(w - 1, -1, -1):
        if is_black(x):
            right += 1
        else:
            break

    left = min(max(left, 0), max_margin)
    right = min(max(right, 0), max_margin)
    if left < min_margin:
        left = 0
    if right < min_margin:
        right = 0
    return left, right


def crop_margins(img: Image.Image, left: int, right: int) -> Image.Image:
    w, h = img.size
    if left + right >= w:
        return img
    return img.crop((left, 0, w - right, h))


def split_lr(img: Image.Image) -> tuple[Image.Image, Image.Image]:
    """画像を縦方向に半分に分割。漫画右綴じなので (右半分, 左半分) の順で返す。"""
    w, h = img.size
    half = w // 2
    left_page = img.crop((0, 0, half, h))
    right_page = img.crop((half, 0, w, h))
    return right_page, left_page  # 右ページが先、左ページが後


def out_name(seq: int, ext: str) -> str:
    return f"{seq:03d}{ext}"


def process_volume(
    vol_dir: Path,
    black_max: int,
    min_margin: int,
    max_margin: int,
    quality: int,
    dry_run: bool,
) -> None:
    images = list_images(vol_dir)
    if not images:
        print(f"[skip] no images: {vol_dir}")
        return

    # 出力先 = 巻フォルダ直下に「同名 (巻数) のサブフォルダ」
    out_dir = vol_dir / vol_dir.name
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
    print(f"  out: {out_dir}")

    seq = 1
    for idx, img_path in enumerate(images):
        try:
            img = Image.open(img_path)
            img.load()
        except Exception as e:
            print(f"  [error] open {img_path.name}: {e}")
            continue

        left, right = detect_horizontal_margins(
            img,
            black_max=black_max,
            min_margin=min_margin,
            max_margin=max_margin,
        )
        cropped = crop_margins(img, left, right) if (left or right) else img

        ext = img_path.suffix.lower()
        if ext == ".jpeg":
            ext = ".jpg"
        if ext not in (".jpg", ".png", ".webp"):
            ext = ".jpg"

        if idx == 0:
            target = out_dir / out_name(seq, ext)
            seq += 1
            print(f"  [cover] {img_path.name}  trim L={left} R={right}  → {target.name}")
            if not dry_run:
                _save(cropped, target, quality)
        else:
            right_page, left_page = split_lr(cropped)
            t1 = out_dir / out_name(seq, ext); seq += 1
            t2 = out_dir / out_name(seq, ext); seq += 1
            print(
                f"  [split] {img_path.name}  trim L={left} R={right}  "
                f"→ {t1.name} (R), {t2.name} (L)"
            )
            if not dry_run:
                _save(right_page, t1, quality)
                _save(left_page, t2, quality)

    print(f"[done] {vol_dir} → {out_dir} ({seq - 1} files)")


def _save(img: Image.Image, path: Path, quality: int) -> None:
    ext = path.suffix.lower()
    params: dict = {}
    if ext == ".jpg":
        params["quality"] = quality
        params["optimize"] = True
        if img.mode != "RGB":
            img = img.convert("RGB")
    elif ext == ".webp":
        params["quality"] = quality
    img.save(path, **params)


def main() -> None:
    ap = argparse.ArgumentParser(description="見開き画像の左右余白除去 + 分割")
    ap.add_argument("dirs", nargs="+", help="巻フォルダ")
    ap.add_argument("--black-max", type=int, default=60,
                    help="各列の平均輝度がこの値以下なら 黒余白 扱い (0-255)")
    ap.add_argument("--min-margin", type=int, default=5)
    ap.add_argument("--max-margin", type=int, default=1200)
    ap.add_argument("--jpeg-quality", type=int, default=92)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    for d in args.dirs:
        vol = Path(d).expanduser().resolve()
        if not vol.is_dir():
            print(f"[skip] not a directory: {vol}")
            continue
        print(f"=== {vol} ===")
        process_volume(
            vol,
            black_max=args.black_max,
            min_margin=args.min_margin,
            max_margin=args.max_margin,
            quality=args.jpeg_quality,
            dry_run=args.dry_run,
        )


if __name__ == "__main__":
    main()
