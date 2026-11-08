"""
Unit tests for the Embedded JPEG Preview Fast-Path for RAW scanning.

Builds synthetic RAW containers (binary padding + real embedded JPEGs) and
verifies extraction, header-only probing, hashing, duplicate classification,
fast BGR loading, thumbnail/preview warming, and full-image serving.
"""

import io
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from backend.analyzer.raw_fastpath import (  # noqa: E402
    extract_embedded_jpeg_bytes,
    load_bgr_fast,
    probe_image_dimensions,
)
from backend.analyzer.duplicates import (  # noqa: E402
    classify_duplicate_group,
    compute_hash,
)


def _make_jpeg_bytes(width, height, orientation=None, seed=0, quality=90):
    """Deterministic noisy JPEG (noise defeats over-compression)."""
    rng = np.random.RandomState(seed)
    arr = rng.randint(0, 256, (height, width, 3), dtype=np.uint8)
    img = Image.fromarray(arr, mode="RGB")
    buf = io.BytesIO()
    if orientation is not None:
        exif = Image.Exif()
        exif[274] = orientation
        img.save(buf, "JPEG", quality=quality, exif=exif)
    else:
        img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def _write_synthetic_cr3(path, large_jpeg=None, small_jpeg=None):
    """Fake .CR3: header padding + small thumb + box padding + large preview."""
    if small_jpeg is None:
        small_jpeg = _make_jpeg_bytes(160, 120, seed=11)
    if large_jpeg is None:
        large_jpeg = _make_jpeg_bytes(1600, 1200, orientation=6, seed=42)
    header = b"CR3\x00FAKE-HEADER" + b"PAD0" * 1024
    box_padding = b"BOX\x00moov-padding" + b"BX1F" * 2048
    trailing = b"TAIL" * 512
    with open(path, "wb") as f:
        f.write(header + small_jpeg + box_padding + large_jpeg + trailing)
    return small_jpeg, large_jpeg


def test_scan_largest_embedded_jpeg_in_synthetic_raw_container(tmp_path):
    cr3_path = tmp_path / "sample.cr3"
    small_jpeg, large_jpeg = _write_synthetic_cr3(cr3_path)
    assert len(large_jpeg) >= 16384

    found = extract_embedded_jpeg_bytes(str(cr3_path), min_long_edge=1080)
    assert found is not None, "expected the 1600x1200 embedded preview"
    assert found == large_jpeg
    with Image.open(io.BytesIO(found)) as img:
        assert img.size == (1600, 1200)

    # Orientation=6 swaps dimensions without decoding pixels.
    assert probe_image_dimensions(str(cr3_path)) == (1200, 1600)


def test_raw_compute_hash_and_duplicate_classification(tmp_path):
    shared_large = _make_jpeg_bytes(1600, 1200, orientation=6, seed=7)
    cr3_a = tmp_path / "a.cr3"
    cr3_b = tmp_path / "b.cr3"
    _write_synthetic_cr3(cr3_a, large_jpeg=shared_large)
    _write_synthetic_cr3(cr3_b, large_jpeg=shared_large)

    h = compute_hash(str(cr3_a))
    assert isinstance(h, str) and len(h) == 16, f"expected 16-char hex phash, got {h!r}"
    int(h, 16)  # must be valid hex

    results = classify_duplicate_group([({"id": 1}, str(cr3_a)), ({"id": 2}, str(cr3_b))])
    assert len(results) == 2
    for _photo_obj, sim, group_type in results:
        assert group_type == "burst"
        assert sim >= 0.97, f"expected near-identical similarity, got {sim}"


def test_load_bgr_fast_and_pipeline_load_image(tmp_path, monkeypatch):
    from backend.analyzer.pipeline import fast_generate_thumbnail_from_path, load_image

    cr3_path = tmp_path / "photo.cr3"
    _write_synthetic_cr3(cr3_path)

    bgr, used_preview = load_bgr_fast(str(cr3_path), min_long_edge=1080)
    assert used_preview is True
    assert bgr is not None
    assert bgr.shape == (1600, 1200, 3), f"unexpected transposed shape {bgr.shape}"

    pipe_bgr, meta = load_image(str(cr3_path))
    assert pipe_bgr is not None
    assert pipe_bgr.shape == (1600, 1200, 3)
    assert isinstance(meta, dict)

    # Thumbnail generation warms both the thumbnail and the preview cache.
    thumbs_dir = tmp_path / "thumbnails"
    previews_dir = tmp_path / "previews"
    thumbs_dir.mkdir()
    previews_dir.mkdir()
    monkeypatch.setenv("FIRSTPASS_PREVIEWS_DIR", str(previews_dir))

    import backend.routers.review as review_module

    monkeypatch.setattr(review_module, "PREVIEWS_DIR", Path(previews_dir))

    photo_id = 7
    thumb_path = fast_generate_thumbnail_from_path(
        str(cr3_path), photo_id, 300, str(thumbs_dir)
    )
    assert thumb_path and os.path.exists(thumb_path)
    assert thumb_path == os.path.join(str(thumbs_dir), f"{photo_id}.jpg")
    warmed_preview = previews_dir / f"{photo_id}.jpg"
    assert warmed_preview.exists(), "expected high-res preview to be warmed"

    class _FakePhoto:
        id = photo_id
        path = str(cr3_path)

    # Cold path: review regenerates the preview via the embedded-JPEG fast-path.
    warmed_preview.unlink()
    loaded = review_module._load_full_image_bytes(_FakePhoto())
    assert loaded is not None
    data, media_type = loaded
    assert media_type == "image/jpeg"
    assert data[:3] == b"\xff\xd8\xff"
    assert warmed_preview.exists(), "expected review to re-cache the preview"
    with Image.open(io.BytesIO(data)) as served:
        served.load()
        assert served.size == (1200, 1600), f"expected normalized preview, got {served.size}"

    # Warm path: subsequent review is an instant SSD hit.
    loaded2 = review_module._load_full_image_bytes(_FakePhoto())
    assert loaded2 is not None and loaded2[1] == "image/jpeg"


def test_header_only_probe_dimensions_on_jpeg(tmp_path, monkeypatch):
    jpeg_path = tmp_path / "rotated.jpg"
    Image.fromarray(
        np.random.RandomState(3).randint(0, 256, (1000, 2000, 3), dtype=np.uint8)
    ).save(str(jpeg_path), "JPEG", quality=90, exif=_exif_orientation(6))

    # Prove no full pixel decode: exif_transpose must never be called.
    def _forbid_transpose(_img):
        raise AssertionError("exif_transpose must not run during header-only probe")

    monkeypatch.setattr(ImageOps, "exif_transpose", _forbid_transpose)
    assert probe_image_dimensions(str(jpeg_path)) == (1000, 2000)


def _exif_orientation(value):
    exif = Image.Exif()
    exif[274] = value
    return exif
