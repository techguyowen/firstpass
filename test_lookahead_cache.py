"""
Predictive lookahead caching regression tests.

Covers the backend in-memory LRU RAM cache and lookahead endpoint in
backend/routers/review.py:
- get_full_image serves MISS on first read, then HIT-RAM from memory
- preload_lookahead warms missing frames (primed / queued counts)
- LRU eviction honors the frame-count cap and the byte budget
- invalid request bodies are rejected with 400

Run with: .venv-build/bin/python test_lookahead_cache.py
"""

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from backend.database import Base
from backend.models.photo import Photo as PhotoModel
from backend.routers import review as review_router


def _make_db(n_photos=5):
    tmp = Path(tempfile.mkdtemp(prefix="firstpass-lookahead-test-"))
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    ids = []
    for i in range(n_photos):
        payload = (f"JPEG-DATA-{i}-".encode() * 200)[:4000]
        f = tmp / f"photo_{i}.jpg"
        f.write_bytes(payload)
        photo = PhotoModel(
            path=str(f),
            filename=f.name,
            folder=str(tmp),
            file_size=len(payload),
            width=100,
            height=100,
            status="pending",
        )
        db.add(photo)
        db.commit()
        db.refresh(photo)
        ids.append(photo.id)
    return db, tmp, ids


def test_full_image_ram_hit():
    db, _tmp, ids = _make_db(3)
    try:
        review_router._clear_ram_cache()
        pid = ids[0]

        first = review_router.get_full_image(pid, db)
        assert first.headers["X-Cache"] == "MISS", "first read must be a MISS"
        body = first.body
        assert len(body) > 0

        second = review_router.get_full_image(pid, db)
        assert second.headers["X-Cache"] == "HIT-RAM", "second read must hit RAM"
        assert second.body == body, "RAM bytes must match disk bytes"
        assert second.headers["Cache-Control"] == "public, max-age=86400, immutable"
    finally:
        db.close()
        review_router._clear_ram_cache()


def test_preload_lookahead_warms_cache():
    db, _tmp, ids = _make_db(5)
    try:
        review_router._clear_ram_cache()

        res = review_router.preload_lookahead({"photo_ids": ids}, db)
        assert res["success"] is True
        assert res["primed"] == 0, f"nothing cached yet, got {res}"
        assert res["queued"] == len(ids), f"expected all warmed, got {res}"

        for pid in ids:
            resp = review_router.get_full_image(pid, db)
            assert resp.headers["X-Cache"] == "HIT-RAM", f"photo {pid} not primed"

        res2 = review_router.preload_lookahead({"photo_ids": ids}, db)
        assert res2["success"] is True
        assert res2["primed"] == len(ids), f"expected all primed, got {res2}"
        assert res2["queued"] == 0

        # Unknown / offline ids are skipped, not fatal
        res3 = review_router.preload_lookahead({"photo_ids": [999999999]}, db)
        assert res3 == {"success": True, "primed": 0, "queued": 0}
    finally:
        db.close()
        review_router._clear_ram_cache()


def test_preload_lookahead_rejects_bad_body():
    db, _tmp, _ids = _make_db(1)
    try:
        for bad in ({"photo_ids": "nope"}, {"photo_ids": None}):
            try:
                review_router.preload_lookahead(bad, db)
            except HTTPException as e:
                assert e.status_code == 400
            else:
                raise AssertionError(f"expected HTTPException(400) for {bad!r}")
    finally:
        db.close()


def test_lru_frame_count_eviction():
    try:
        review_router._clear_ram_cache()
        for i in range(review_router.RAM_CACHE_MAX_FRAMES + 5):
            review_router._put_cached_full_image(1000 + i, b"x" * 10)
        assert len(review_router.LRU_RAM_CACHE) == review_router.RAM_CACHE_MAX_FRAMES
        # Oldest-first eviction: the first inserts must be gone, latest kept
        assert 1000 not in review_router.LRU_RAM_CACHE
        assert 1004 not in review_router.LRU_RAM_CACHE
        assert (1000 + review_router.RAM_CACHE_MAX_FRAMES + 4) in review_router.LRU_RAM_CACHE
        # Byte accounting stays exact
        assert review_router._ram_cache_size_bytes() == review_router.RAM_CACHE_MAX_FRAMES * 10
    finally:
        review_router._clear_ram_cache()


def test_lru_byte_budget_eviction():
    old_budget = review_router.RAM_CACHE_MAX_BYTES
    try:
        review_router._clear_ram_cache()
        review_router.RAM_CACHE_MAX_BYTES = 100
        for i in range(5):
            review_router._put_cached_full_image(2000 + i, b"y" * 30)
        assert review_router._ram_cache_size_bytes() <= 100
        assert len(review_router.LRU_RAM_CACHE) == 3
    finally:
        review_router.RAM_CACHE_MAX_BYTES = old_budget
        review_router._clear_ram_cache()


def main():
    tests = [
        ("full-image RAM HIT", test_full_image_ram_hit),
        ("preload-lookahead warming", test_preload_lookahead_warms_cache),
        ("preload-lookahead bad body", test_preload_lookahead_rejects_bad_body),
        ("LRU frame-count eviction", test_lru_frame_count_eviction),
        ("LRU byte-budget eviction", test_lru_byte_budget_eviction),
    ]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS {name}")
        except Exception as e:
            failed += 1
            print(f"  FAIL {name}: {e}")
    print(f"{len(tests) - failed}/{len(tests)} lookahead cache tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
