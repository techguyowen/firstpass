"""
Embedded JPEG preview fast-path for RAW scanning.

RAW containers (CR3/NEF/ARW/CR2/RAF/DNG/...) embed one or more full JPEG
previews. Decoding the full sensor data with LibRaw for every scan/hash/
thumbnail operation is ~1000x slower than reusing those previews, so this
module centralizes:

- header-only dimension probing (never decodes pixels when headers suffice),
- embedded JPEG extraction (rawpy thumb first, binary container scan fallback),
- EXIF-aware fast PIL/BGR loading with seamless rawpy fallback.
"""

from __future__ import annotations

import io
import logging
import os
from typing import Optional, TYPE_CHECKING

from PIL import Image, ImageOps

if TYPE_CHECKING:
    import numpy as np

logger = logging.getLogger(__name__)

try:
    import rawpy
except ImportError:  # pragma: no cover - optional dependency
    rawpy = None

RAW_EXTS = {'.cr2', '.cr3', '.nef', '.arw', '.orf', '.raf', '.dng', '.rw2'}

# EXIF Orientation tag id.
_ORIENTATION_TAG = 274  # 0x0112

# Orientations that swap width/height (any 90/270-degree rotation).
_SWAP_ORIENTATIONS = (5, 6, 7, 8)

# Orientations that require any transpose at all.
_TRANSPOSE_ORIENTATIONS = (2, 3, 4, 5, 6, 7, 8)

# Candidate JPEG SOI (start-of-image) 4-byte prefixes seen in RAW containers.
_SOI_PREFIXES = (
    b'\xff\xd8\xff\xe0',  # JFIF / APP0
    b'\xff\xd8\xff\xe1',  # Exif / APP1
    b'\xff\xd8\xff\xdb',  # DQT-first streams
    b'\xff\xd8\xff\xc0',  # SOF0-first streams
    b'\xff\xd8\xff\xc4',  # DHT-first streams
)

_EOI = b'\xff\xd9'

# Upper bound on how many leading bytes of a container are scanned.
_MAX_SCAN_BYTES = 32 * 1024 * 1024

# Safety caps so pathological containers cannot stall the scan.
_MAX_SOI_CANDIDATES = 128
_MAX_EOI_ATTEMPTS_PER_SOI = 8


def is_raw_path(filepath: str) -> bool:
    """True when the path has a known RAW container extension."""
    return os.path.splitext(filepath)[1].lower() in RAW_EXTS


def _read_exif_orientation(img: Image.Image) -> Optional[int]:
    """Best-effort EXIF orientation read; None when absent/unreadable."""
    try:
        exif = img.getexif()
        if exif:
            orientation = exif.get(_ORIENTATION_TAG)
            if orientation is not None:
                return int(orientation)
    except Exception:
        pass
    try:
        legacy = img._getexif()  # type: ignore[attr-defined]
        if legacy:
            orientation = legacy.get(_ORIENTATION_TAG)
            if orientation is not None:
                return int(orientation)
    except Exception:
        pass
    return None


def _scan_largest_embedded_jpeg(filepath: str, min_bytes: int = 16384) -> Optional[bytes]:
    """Return the raw bytes of the largest valid embedded JPEG in a container.

    Scans up to the first 32 MB for JPEG SOI markers, slices each candidate
    through its EOI marker, validates headers with Pillow (size read only,
    no full pixel decode), and keeps the largest candidate by pixel area
    that is at least ``min_bytes`` long. Returns None when nothing qualifies.
    """
    try:
        with open(filepath, 'rb') as f:
            data = f.read(_MAX_SCAN_BYTES)
    except OSError:
        return None

    if len(data) < 6:
        return None

    soi_positions: list[int] = []
    for prefix in _SOI_PREFIXES:
        start = 0
        while True:
            idx = data.find(prefix, start)
            if idx < 0:
                break
            soi_positions.append(idx)
            start = idx + 1
    if not soi_positions:
        return None
    soi_positions.sort()
    del soi_positions[_MAX_SOI_CANDIDATES:]

    best: Optional[bytes] = None
    best_area = 0

    for soi in soi_positions:
        eoi_search = soi + 4
        for _ in range(_MAX_EOI_ATTEMPTS_PER_SOI):
            eoi = data.find(_EOI, eoi_search)
            if eoi < 0:
                break
            end = eoi + len(_EOI)
            eoi_search = end
            if end - soi < min_bytes:
                continue
            candidate = data[soi:end]
            try:
                with Image.open(io.BytesIO(candidate)) as img:
                    w, h = img.size
                    if w <= 0 or h <= 0:
                        continue
                    try:
                        img.verify()
                    except Exception:
                        continue
            except Exception:
                # Possibly a stray EOI inside metadata; extend to the next one.
                continue
            area = w * h
            if area > best_area:
                best_area = area
                best = candidate
            break

    return best


def extract_embedded_jpeg_bytes(filepath: str, min_long_edge: int = 0) -> Optional[bytes]:
    """Extract the embedded JPEG preview bytes from a RAW container.

    Tries ``rawpy.extract_thumb()`` first, then falls back to a binary scan
    for the largest embedded JPEG. Only previews with
    ``max(w, h) >= min_long_edge`` are returned.
    """
    if rawpy is not None:
        try:
            with rawpy.imread(filepath) as raw:
                try:
                    thumb = raw.extract_thumb()
                except Exception:
                    thumb = None
                if thumb is not None and getattr(thumb, 'format', None) == rawpy.ThumbFormat.JPEG:
                    thumb_data = getattr(thumb, 'data', None)
                    if thumb_data:
                        try:
                            with Image.open(io.BytesIO(thumb_data)) as img:
                                w, h = img.size
                            if max(w, h) >= min_long_edge:
                                return bytes(thumb_data)
                        except Exception:
                            pass
        except Exception:
            pass

    try:
        data = _scan_largest_embedded_jpeg(filepath)
    except Exception:
        return None
    if not data:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            w, h = img.size
        if max(w, h) >= min_long_edge:
            return data
    except Exception:
        return None
    return None


def normalize_jpeg_orientation_bytes(jpeg_bytes: bytes) -> bytes:
    """Return orientation-normalized JPEG bytes.

    Applies EXIF transpose + JPEG re-encode (quality 92, subsampling=0) only
    when the EXIF Orientation tag is 2-8; otherwise returns the input
    untouched (zero re-encoding when Orientation is 1 or absent).
    """
    try:
        with Image.open(io.BytesIO(jpeg_bytes)) as img:
            orientation = _read_exif_orientation(img)
            if orientation not in _TRANSPOSE_ORIENTATIONS:
                return jpeg_bytes
            transposed = ImageOps.exif_transpose(img)
            if transposed.mode not in ('RGB', 'L', 'CMYK'):
                transposed = transposed.convert('RGB')
            buf = io.BytesIO()
            transposed.save(buf, 'JPEG', quality=92, subsampling=0)
            return buf.getvalue()
    except Exception:
        return jpeg_bytes


def probe_image_dimensions(filepath: str) -> tuple[int, int]:
    """Fast header-only dimension probe; returns (0, 0) on failure.

    Never decodes full image pixels when header metadata is available:
    Pillow ``Image.open`` + ``img.size`` only parses headers, EXIF
    orientation is applied arithmetically (no ``exif_transpose`` call, which
    would force pixel loading), and RAW files additionally consult
    ``rawpy.sizes`` / the embedded JPEG preview headers.
    """
    try:
        with Image.open(filepath) as img:
            w, h = img.size
            orientation = _read_exif_orientation(img)
            if orientation in _SWAP_ORIENTATIONS:
                w, h = h, w
            if (not is_raw_path(filepath)) or max(w, h) >= 512:
                if w > 0 and h > 0:
                    return (int(w), int(h))
    except Exception:
        pass

    if is_raw_path(filepath):
        if rawpy is not None:
            try:
                with rawpy.imread(filepath) as raw:
                    sizes = raw.sizes
                    w, h = int(sizes.width), int(sizes.height)
                    flip = getattr(sizes, 'flip', 0)
                    if flip in (5, 6, 7, 8) or flip in (5, 6):
                        w, h = h, w
                    if w > 0 and h > 0:
                        return (w, h)
            except Exception:
                pass

        try:
            data = extract_embedded_jpeg_bytes(filepath)
            if data:
                with Image.open(io.BytesIO(data)) as img:
                    w, h = img.size
                    orientation = _read_exif_orientation(img)
                    if orientation in _SWAP_ORIENTATIONS:
                        w, h = h, w
                    if w > 0 and h > 0:
                        return (int(w), int(h))
        except Exception:
            pass

        return (0, 0)

    return (0, 0)


def open_pil_fast(filepath: str, min_long_edge: int = 256) -> Optional[Image.Image]:
    """Open an image via the embedded-JPEG fast-path when applicable.

    RAW files load from the embedded JPEG preview (>= ``min_long_edge``),
    falling back to ``rawpy.postprocess(half_size=True)``; regular images
    open through Pillow with EXIF transpose. Always returns RGB.
    """
    if is_raw_path(filepath):
        try:
            data = extract_embedded_jpeg_bytes(filepath, min_long_edge=min_long_edge)
        except Exception:
            data = None
        if data:
            try:
                with Image.open(io.BytesIO(data)) as img:
                    img.load()
                    transposed = ImageOps.exif_transpose(img)
                    if transposed.mode != 'RGB':
                        transposed = transposed.convert('RGB')
                    else:
                        transposed = transposed.copy()
                    return transposed
            except Exception:
                pass
        if rawpy is not None:
            try:
                with rawpy.imread(filepath) as raw:
                    rgb = raw.postprocess(half_size=True, use_camera_wb=True)
                return Image.fromarray(rgb)
            except Exception:
                return None
        return None

    try:
        with Image.open(filepath) as img:
            img = ImageOps.exif_transpose(img)
            return img.convert('RGB')
    except Exception:
        return None


def load_bgr_fast(
    filepath: str,
    min_long_edge: int = 1080,
    prefer_embedded_preview: bool = True,
) -> tuple[Optional[np.ndarray], bool]:
    """Load a BGR image, preferring the embedded preview for RAW files.

    Returns ``(image_bgr, used_embedded_preview)``. Falls back to
    ``rawpy.postprocess(half_size=True)`` for RAW files without a usable
    preview, and to Pillow (+ ``cv2.imread`` fallback) for regular images.
    """
    import numpy as np

    try:
        import cv2
    except ImportError:  # pragma: no cover - cv2 is a hard backend dep
        cv2 = None  # type: ignore[assignment]

    if is_raw_path(filepath):
        if prefer_embedded_preview:
            try:
                jpeg_bytes = extract_embedded_jpeg_bytes(filepath, min_long_edge=min_long_edge)
            except Exception:
                jpeg_bytes = None
            if jpeg_bytes:
                try:
                    needs_transpose = False
                    try:
                        with Image.open(io.BytesIO(jpeg_bytes)) as probe:
                            orientation = _read_exif_orientation(probe)
                            needs_transpose = orientation in _TRANSPOSE_ORIENTATIONS
                    except Exception:
                        needs_transpose = False

                    image_bgr = None
                    if needs_transpose or cv2 is None:
                        with Image.open(io.BytesIO(jpeg_bytes)) as probe_img:
                            probe_img.load()
                            pil = ImageOps.exif_transpose(probe_img).convert('RGB')
                        if cv2 is not None:
                            image_bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
                        else:
                            image_bgr = np.array(pil)[:, :, ::-1]
                    else:
                        image_bgr = cv2.imdecode(
                            np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR
                        )

                    if image_bgr is not None and max(image_bgr.shape[:2]) >= min_long_edge:
                        return image_bgr, True
                except Exception:
                    pass

        if rawpy is not None and cv2 is not None:
            try:
                with rawpy.imread(filepath) as raw:
                    rgb = raw.postprocess(half_size=True, use_camera_wb=True)
                return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), False
            except Exception:
                pass
        return None, False

    try:
        with Image.open(filepath) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            rgb_arr = np.array(img)
        if cv2 is not None:
            return cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR), False
        return rgb_arr[:, :, ::-1], False
    except Exception:
        pass

    try:
        if cv2 is not None:
            return cv2.imread(filepath), False
    except Exception:
        pass
    return None, False
