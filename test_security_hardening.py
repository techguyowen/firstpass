"""
Security hardening regression tests for FirstPass.

Covers:
- updater.CURRENT_VERSION is defined
- updater download URL / asset-name validation (host, scheme, traversal, extension)
- updater install path validation (directory escape, extension, existence)
- settings github_repo format validation
- SettingsBase default github_repo value
Run with: .venv-build/bin/python test_security_hardening.py
"""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from fastapi import HTTPException

from backend.routers import updater
from backend.routers.settings import validate_github_repo
from backend.schemas.photo import SettingsBase


def _expect_http400(fn, *args, label=""):
    try:
        fn(*args)
    except HTTPException as e:
        assert e.status_code == 400, f"{label}: expected 400, got {e.status_code}"
        return
    raise AssertionError(f"{label}: expected HTTPException(400), none raised")


def test_current_version():
    assert updater.CURRENT_VERSION == "1.0.1", f"CURRENT_VERSION={updater.CURRENT_VERSION!r}"


def test_download_validation():
    good = "https://github.com/owner/repo/releases/download/v1.0.0/FirstPass-1.0.0-arm64.dmg"
    target = updater._validate_download_params(good, "FirstPass-1.0.0-arm64.dmg")
    assert target.name == "FirstPass-1.0.0-arm64.dmg"

    # origins outside the allowlist
    _expect_http400(
        updater._validate_download_params,
        "https://evil.example.com/x.dmg", "x.dmg", label="evil host",
    )
    # non-https scheme
    _expect_http400(
        updater._validate_download_params,
        "http://github.com/owner/repo/x.dmg", "x.dmg", label="http scheme",
    )
    # path traversal tricks with .. or path separators are strictly rejected
    _expect_http400(
        updater._validate_download_params, good, "../evil.dmg", label="dotdot slash",
    )
    _expect_http400(
        updater._validate_download_params, good, "..\\evil.dmg", label="backslash",
    )
    _expect_http400(
        updater._validate_download_params, good, "..", label="dotdot",
    )
    # disallowed extension
    _expect_http400(
        updater._validate_download_params, good, "payload.sh", label="bad ext",
    )
    # .zip allowed for download
    target_zip = updater._validate_download_params(good, "archive.zip")
    assert target_zip.name == "archive.zip"


def test_install_validation(tmp_dir: Path):
    updater.UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    legit = updater.UPDATES_DIR / "FirstPass-1.0.0-arm64.dmg"
    legit.write_bytes(b"fake-installer")
    try:
        resolved = updater._validate_install_path(str(legit))
        assert resolved.name == legit.name
    finally:
        legit.unlink(missing_ok=True)

    # escape from updates dir
    outside = tmp_dir / "evil.dmg"
    outside.write_bytes(b"x")
    _expect_http400(updater._validate_install_path, str(outside), label="escape")
    # missing file
    _expect_http400(
        updater._validate_install_path,
        str(updater.UPDATES_DIR / "nope.dmg"), label="missing",
    )
    # bad extension inside dir
    bad_ext = updater.UPDATES_DIR / "note.txt"
    bad_ext.write_text("hi")
    try:
        _expect_http400(updater._validate_install_path, str(bad_ext), label="bad ext")
    finally:
        bad_ext.unlink(missing_ok=True)


def test_github_repo_validation():
    validate_github_repo("techguyowen/firstpass")
    validate_github_repo("owner-name/repo.name_1")
    for bad in ["not-a-repo", "a/b/c", "", "owner/", "/repo", "own er/repo", "owner/repo/extra"]:
        _expect_http400(validate_github_repo, bad, label=f"repo {bad!r}")


def test_settings_default_repo():
    assert SettingsBase.model_fields["github_repo"].default == "techguyowen/firstpass"


def main():
    tmp_dir = Path(tempfile.mkdtemp(prefix="firstpass-sec-test-"))
    tests = [
        ("CURRENT_VERSION", test_current_version),
        ("download validation", test_download_validation),
        ("install validation", lambda: test_install_validation(tmp_dir)),
        ("github_repo validation", test_github_repo_validation),
        ("settings default repo", test_settings_default_repo),
    ]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS {name}")
        except Exception as e:
            failed += 1
            print(f"  FAIL {name}: {e}")
    print(f"{len(tests) - failed}/{len(tests)} security tests passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
