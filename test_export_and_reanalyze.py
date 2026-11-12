"""
Unit tests for companion .xmp sidecar sync on export and user_overridden preservation.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from backend.models.photo import Photo  # noqa: E402
from backend.routers.review import _companion_xmp_paths, _sync_companion_xmps  # noqa: E402


def test_companion_xmp_paths_and_sync(tmp_path):
    src_dir = tmp_path / "src"
    dst_dir = tmp_path / "dst"
    src_dir.mkdir()
    dst_dir.mkdir()

    raw = src_dir / "IMG_1001.CR3"
    raw.write_bytes(b"raw")
    xmp_stem = src_dir / "IMG_1001.xmp"
    xmp_name = src_dir / "IMG_1001.CR3.xmp"
    xmp_stem.write_text("<xmp>stem</xmp>", encoding="utf-8")
    xmp_name.write_text("<xmp>name</xmp>", encoding="utf-8")

    found = _companion_xmp_paths(raw)
    assert len(found) == 2

    # Collision-renamed copy target
    dst_copy = dst_dir / "IMG_1001_1.CR3"
    dst_copy.write_bytes(b"raw")
    _sync_companion_xmps(raw, dst_copy, move=False)
    assert (dst_dir / "IMG_1001_1.xmp").read_text(encoding="utf-8") == "<xmp>stem</xmp>"
    assert (dst_dir / "IMG_1001_1.CR3.xmp").read_text(encoding="utf-8") == "<xmp>name</xmp>"
    assert xmp_stem.exists() and xmp_name.exists()

    # Move removes source sidecars
    dst_move = dst_dir / "IMG_1001_moved.CR3"
    _sync_companion_xmps(raw, dst_move, move=True)
    assert (dst_dir / "IMG_1001_moved.xmp").exists()
    assert (dst_dir / "IMG_1001_moved.CR3.xmp").exists()
    assert not xmp_stem.exists() and not xmp_name.exists()


def test_photo_model_has_user_overridden():
    p = Photo(path="/tmp/a.jpg", filename="a.jpg", folder="/tmp", status="accepted", user_overridden=True)
    assert p.user_overridden is True
