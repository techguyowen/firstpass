#!/usr/bin/env bash
# =============================================================================
# FirstPass — Mac Build Script
# Builds a distributable .dmg installer that requires NO external dependencies.
# =============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
APP_DIR="$PROJECT_ROOT/app"
BUILD_DIR="$PROJECT_ROOT/build"
PYTHON_DIST_DIR="$PROJECT_ROOT/app/python-backend"

echo "=================================================="
echo "  FirstPass — Mac Build"
echo "  Project: $PROJECT_ROOT"
echo "=================================================="

# -----------------------------------------------------------------------
# 1. Check prerequisites
# -----------------------------------------------------------------------
echo ""
echo "Step 1/7: Checking prerequisites..."

if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 not found. Install from https://www.python.org"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org"
    exit 1
fi

PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
NODE_VERSION=$(node --version)
echo "  Python: $PYTHON_VERSION"
echo "  Node:   $NODE_VERSION"

# -----------------------------------------------------------------------
# 2. Set up Python virtual environment
# -----------------------------------------------------------------------
echo ""
echo "Step 2/7: Setting up Python virtual environment..."

VENV_DIR="$PROJECT_ROOT/.venv-build"
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install --upgrade pip setuptools wheel

# Install PyTorch
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo "  Detected Apple Silicon — installing PyTorch"
    pip install torch torchvision
else
    echo "  Detected Intel Mac — installing PyTorch"
    pip install torch torchvision
fi

# Install all other requirements
pip install -r "$BACKEND_DIR/requirements.txt"

# Install PyInstaller
pip install pyinstaller

# -----------------------------------------------------------------------
# 3. Download AI models (for bundling)
# -----------------------------------------------------------------------
echo ""
echo "Step 3/7: Downloading AI models for bundling..."

python3 "$BACKEND_DIR/download_models.py" || echo "  Model download finished with warnings."

# -----------------------------------------------------------------------
# 4. Pre-download BRISQUE model weights (so they're in cache for bundling)
# -----------------------------------------------------------------------
echo ""
echo "Step 4/7: Pre-caching BRISQUE model weights..."

python3 -c "
try:
    import pyiqa
    print('  Downloading BRISQUE model weights...')
    model = pyiqa.create_metric('brisque', device='cpu')
    print('  BRISQUE model ready.')
except Exception as e:
    print(f'  Warning: BRISQUE pre-cache skipped ({e}).')
"

# -----------------------------------------------------------------------
# 5. Build Python backend with PyInstaller
# -----------------------------------------------------------------------
echo ""
echo "Step 5/7: Building Python backend with PyInstaller..."

cd "$PROJECT_ROOT"
SPEC_FILE="$BUILD_DIR/firstpass.spec"
if [ ! -f "$SPEC_FILE" ]; then
    SPEC_FILE="$BUILD_DIR/photo-culler.spec"
fi

pyinstaller "$SPEC_FILE" \
    --distpath "$APP_DIR/python-backend-dist" \
    --workpath "$BUILD_DIR/pyinstaller-work" \
    --clean \
    --noconfirm

# Move the built backend into the app directory where electron-builder expects it
mkdir -p "$PYTHON_DIST_DIR"
rm -rf "$PYTHON_DIST_DIR"/*
if [ -d "$APP_DIR/python-backend-dist/firstpass-backend" ]; then
    cp -r "$APP_DIR/python-backend-dist/firstpass-backend/"* "$PYTHON_DIST_DIR/"
else
    cp -r "$APP_DIR/python-backend-dist/photo-culler-backend/"* "$PYTHON_DIST_DIR/"
fi
echo "  Python backend built: $PYTHON_DIST_DIR"

deactivate

# -----------------------------------------------------------------------
# 6. Build Electron frontend
# -----------------------------------------------------------------------
echo ""
echo "Step 6/7: Building Electron frontend..."

cd "$APP_DIR"
npm run build
echo "  Electron frontend built."

# -----------------------------------------------------------------------
# 7. Package as .dmg
# -----------------------------------------------------------------------
echo ""
echo "Step 7/7: Creating .dmg installer..."

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    npm run package:mac -- --arm64
else
    npm run package:mac -- --x64
fi

echo ""
echo "=================================================="
echo "  Build Complete!"
echo "  Installer: $APP_DIR/dist/"
ls "$APP_DIR/dist/"*.dmg 2>/dev/null || echo "  (check $APP_DIR/dist/ for .dmg file)"
echo "=================================================="
