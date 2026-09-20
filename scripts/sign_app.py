#!/usr/bin/env python3
"""
Ad-hoc codesigns FirstPass.app completely from inside-out.
Ensures all Mach-O binaries, frameworks, and helpers have valid CDHashes,
preventing macOS Gatekeeper / XProtect from reporting corrupted signatures as malware.
"""

import os
import sys
import subprocess
from pathlib import Path

def run(cmd, check=True):
    print(f"  > {' '.join(cmd)}")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"    WARNING ({res.returncode}): {res.stderr.strip() or res.stdout.strip()}")
        if check:
            sys.exit(1)
    return res

def sign_file(path: Path):
    if not path.exists():
        return
    cmd = ["codesign", "--force", "--sign", "-", str(path)]
    run(cmd, check=False)

def sign_app(app_path: Path):
    print(f"Signing app at: {app_path}")
    contents = app_path / "Contents"
    
    # 1. Sign python-backend dylibs & so files
    python_backend = contents / "Resources" / "python-backend"
    if python_backend.exists():
        print("Signing python-backend libraries...")
        for ext in ["*.dylib", "*.so"]:
            for f in python_backend.rglob(ext):
                sign_file(f)
        for bin_name in ["photo-culler-backend", "firstpass-backend"]:
            main_py_bin = python_backend / bin_name
            if main_py_bin.exists():
                sign_file(main_py_bin)

    # 2. Sign frameworks
    frameworks_dir = contents / "Frameworks"
    if frameworks_dir.exists():
        print("Signing frameworks...")
        framework_order = [
            "Mantle.framework",
            "ReactiveObjC.framework",
            "Squirrel.framework",
            "Electron Framework.framework",
        ]
        for fw in framework_order:
            fw_path = frameworks_dir / fw
            if fw_path.exists():
                sign_file(fw_path)

        # 3. Sign helper apps
        for helper_pattern in ["*Helper*.app"]:
            for h_path in frameworks_dir.glob(helper_pattern):
                sign_file(h_path)

    # 4. Sign main executable
    macos_dir = contents / "MacOS"
    if macos_dir.exists():
        print("Signing main executable...")
        for exe in macos_dir.iterdir():
            if exe.is_file() and not exe.name.startswith('.'):
                sign_file(exe)

    # 5. Sign the main bundle
    print("Signing main app bundle...")
    cmd = ["codesign", "--force", "--sign", "-", str(app_path)]
    run(cmd, check=True)

    print("Verifying final bundle signature...")
    ver = subprocess.run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app_path)], capture_output=True, text=True)
    print(ver.stdout)
    print(ver.stderr)
    if ver.returncode == 0:
        print(f"SUCCESS: {app_path.name} signature verified clean!")
    else:
        print(f"Verification note: {ver.stderr}")

if __name__ == "__main__":
    default_targets = [
        Path("app/dist/mac-arm64/FirstPass.app"),
        Path("/Applications/FirstPass.app")
    ]
    target = None
    if len(sys.argv) > 1:
        target = Path(sys.argv[1])
    else:
        for t in default_targets:
            if t.exists():
                target = t
                break
        if not target:
            target = default_targets[0]
    sign_app(target)
