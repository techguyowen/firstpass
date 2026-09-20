#!/usr/bin/env python3
"""
Download AI models needed for photo analysis.
Run this script BEFORE building with PyInstaller.
Models are saved to backend/models_data/ and bundled into the installer.

Models downloaded:
  - dlib shape_predictor_68_face_landmarks.dat  (~100MB) - for eye/face detection
  - dlib mmod_human_face_detector.dat            (~700KB) - CNN face detector
"""

import os
import sys
import urllib.request
import bz2
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
MODELS_DIR = SCRIPT_DIR.parent / "backend" / "models_data"

MODELS = {
    "shape_predictor_68_face_landmarks.dat": {
        "url": "http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2",
        "compressed": True,
        "size_mb": 99,
        "description": "68-point face landmark model (for eye blink detection)",
    },
    "mmod_human_face_detector.dat": {
        "url": "http://dlib.net/files/mmod_human_face_detector.dat.bz2",
        "compressed": True,
        "size_mb": 1,
        "description": "CNN face detector",
    },
}


def download_with_progress(url: str, dest: Path, compressed: bool):
    """Download a file with a simple progress bar."""
    tmp_path = dest.with_suffix(".tmp")

    print(f"  Downloading: {url}")
    print(f"  Destination: {dest}")

    def progress_hook(block_num, block_size, total_size):
        if total_size > 0:
            downloaded = block_num * block_size
            percent = min(100, (downloaded / total_size) * 100)
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            bar_len = 40
            filled = int(bar_len * percent / 100)
            bar = "█" * filled + "░" * (bar_len - filled)
            print(
                f"\r  [{bar}] {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)",
                end="",
                flush=True,
            )
        else:
            mb_downloaded = (block_num * block_size) / (1024 * 1024)
            print(f"\r  Downloaded: {mb_downloaded:.1f} MB", end="", flush=True)

    urllib.request.urlretrieve(url, tmp_path, reporthook=progress_hook)
    print()  # newline after progress bar

    if compressed:
        print("  Decompressing...")
        with bz2.open(tmp_path, "rb") as f_in, open(dest, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
        tmp_path.unlink()
    else:
        tmp_path.rename(dest)

    print(f"  ✓ Saved: {dest.name} ({dest.stat().st_size / (1024*1024):.1f} MB)")


def main():
    print("==================================================")
    print("  FirstPass — AI Model Downloader")
    print("==================================================")
    print("=" * 60)

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    all_ok = True
    for filename, info in MODELS.items():
        dest = MODELS_DIR / filename
        print(f"\n[{filename}]")
        print(f"  Description: {info['description']}")
        print(f"  Size: ~{info['size_mb']} MB")

        if dest.exists():
            print(f"  ✓ Already exists, skipping.")
            continue

        try:
            download_with_progress(info["url"], dest, info["compressed"])
        except Exception as e:
            print(f"\n  ⚠ WARNING: Could not download {filename}: {e}")
            print(f"  Face/eye detection will use OpenCV fallback instead.")
            all_ok = False

    print("\n" + "=" * 60)
    if all_ok:
        print("  ✓ All models ready for bundling.")
    else:
        print("  ⚠ Some models failed — app will still work with fallbacks.")
    print("=" * 60)

    # Write a marker file so build scripts know models were attempted
    marker = MODELS_DIR / ".download_complete"
    marker.write_text("ok")


if __name__ == "__main__":
    main()
