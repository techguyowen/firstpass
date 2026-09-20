# FirstPass 📷

> **Your shoot's first pass, done in minutes.**  
> High-performance, offline-first AI photo culling desktop application for macOS and Windows.

---

## Overview

**FirstPass** dramatically accelerates professional photo selection workflows by automating the initial pass. Powered by local computer vision and machine learning models, FirstPass analyzes sharpness, exposure quality, composition, human facial expressions, and visual duplicates — all completely on your local machine without sending your photos to the cloud.

---

## Key Features

- **Blazing Fast Scanning & RAW Support**: Ingest JPEG, PNG, TIFF, WEBP, HEIC, and all major camera RAW formats (`.CR2`, `.CR3`, `.NEF`, `.ARW`, `.ORF`, `.RAF`, `.DNG`, `.RW2`).
- **Sharpness & Focus Tracking**: Instant blur detection combining Laplacian variance and high-frequency spectral analysis.
- **Exposure Quality Analysis**: LAB-space luminosity distribution evaluation and highlight/shadow clipping detection.
- **Perceptual Aesthetic Assessment**: Deep perceptual quality evaluation (BRISQUE).
- **Composition & Horizon Alignment**: Subject saliency detection and horizon tilt analysis using Hough transforms.
- **Facial Expression & Blink Detection**: Real-time face detection with eye-aspect ratio (EAR) analysis to flag blinks or closed eyes.
- **Smart Burst & Duplicate Grouping**: Perceptual pHash clustering with hamming distance grouping for easy burst selection.
- **Flexible Workflow Integration**: Export accepted selections, move rejected photos, or write industry-standard XMP sidecar metadata directly to your shoot directories.
- **100% On-Device Privacy**: Operates entirely offline. Zero analytics, zero cloud uploads, zero telemetry.

---

## Installation

### macOS
1. Download `FirstPass.dmg` from the Releases page.
2. Open the disk image and drag **FirstPass** to your `Applications` folder.
3. Launch **FirstPass** from Spotlight or Applications.

### Windows
1. Download `FirstPass Setup.exe` from the Releases page.
2. Run the installer and follow the on-screen setup wizard.
3. Launch **FirstPass** from the Start Menu or Desktop shortcut.

> **Self-Contained**: The packaged application includes all required runtimes, AI models, and native binaries. No Python or external dependencies are required.

---

## Keyboard Shortcuts (Review Mode)

Speed up your selection workflow with dedicated single-key hotkeys:

| Key | Action |
|---|---|
| `A` / `1` | Accept / Pick photo |
| `R` / `0` | Reject photo |
| `Space` | Skip / Advance to next photo |
| `←` / `→` | Previous / Next photo |
| `Z` | Toggle 100% Zoom Loupe |
| `F` | Toggle Fullscreen |
| `Esc` | Return to Gallery grid |

---

## Developer Setup

### Prerequisites
- **Python** 3.10+ — [python.org](https://www.python.org)
- **Node.js** 20+ — [nodejs.org](https://nodejs.org)

### Quickstart (Development Mode)

```bash
# 1. Clone the repository
git clone https://github.com/firstpass/firstpass.git
cd firstpass

# 2. Set up Python backend environment
cd backend
python3 -m venv .venv
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 3. Download bundled model weights (one-time setup)
python download_models.py

# 4. Start the backend service
python main.py
# Server runs on http://127.0.0.1:58765

# 5. In a second terminal — run the desktop frontend
cd app
npm install
npm run dev
```

### Packaging Distributables

**macOS:**
```bash
chmod +x build/build-mac.sh
./build/build-mac.sh
# Generates: app/dist/FirstPass-1.0.0.dmg
```

**Windows (PowerShell):**
```powershell
.\build\build-win.ps1
# Generates: app\dist\FirstPass Setup 1.0.0.exe
```

---

## Architecture

```
firstpass/
├── app/                        # Electron + React desktop frontend
│   ├── src/main/               # Electron main process (lifecycle & backend management)
│   ├── src/preload/            # Secure IPC bridge
│   └── src/renderer/src/       # React 18 application
│       ├── pages/              # Gallery, Review, Settings
│       ├── components/         # PhotoCard, ScorePanel, FilterBar, Loupe
│       ├── api/                # Typed REST & WebSocket client
│       └── store/              # Zustand state stores
├── backend/                    # Python FastAPI backend service
│   ├── analyzer/               # Computer vision & ML modules (blur, exposure, faces, etc.)
│   ├── routers/                # REST endpoints (scan, analyze, review, export)
│   ├── models/                 # SQLAlchemy database models (SQLite WAL)
│   └── requirements.txt
└── build/                      # Packaging configurations and build automation
```

---

## Privacy & Security

FirstPass is committed to photographer privacy:
- All image processing and machine learning inference execute 100% on your local hardware.
- No network requests are made with your photos, metadata, or shoot files.
- Works fully offline without an internet connection.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
