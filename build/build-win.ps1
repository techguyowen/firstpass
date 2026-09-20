# FirstPass — Windows Build Script
# Run from PowerShell as Administrator (or from a standard terminal)
# Builds a distributable .exe installer with NO external dependencies required.

param(
    [switch]$Clean = $false
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"
$AppDir = Join-Path $ProjectRoot "app"
$BuildDir = Join-Path $ProjectRoot "build"
$VenvDir = Join-Path $ProjectRoot ".venv-build"
$PythonDistDir = Join-Path $AppDir "python-backend"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  FirstPass — Windows Build" -ForegroundColor Cyan
Write-Host "  Project: $ProjectRoot" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# -----------------------------------------------------------------------
# 1. Check prerequisites
# -----------------------------------------------------------------------
Write-Host "`nStep 1/7: Checking prerequisites..." -ForegroundColor Yellow

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    Write-Host "ERROR: Python not found. Download from https://www.python.org" -ForegroundColor Red
    exit 1
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "ERROR: Node.js not found. Download from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$pythonVersion = & $pythonCmd.Name --version
$nodeVersion = node --version
Write-Host "  Python: $pythonVersion" -ForegroundColor Green
Write-Host "  Node:   $nodeVersion" -ForegroundColor Green

# -----------------------------------------------------------------------
# 2. Set up Python virtual environment
# -----------------------------------------------------------------------
Write-Host "`nStep 2/7: Setting up Python virtual environment..." -ForegroundColor Yellow

if ($Clean -and (Test-Path $VenvDir)) {
    Remove-Item -Recurse -Force $VenvDir
}

if (-not (Test-Path $VenvDir)) {
    & $pythonCmd.Name -m venv $VenvDir
}

$ActivateScript = Join-Path $VenvDir "Scripts\Activate.ps1"
. $ActivateScript

pip install --upgrade pip setuptools wheel

# Install PyTorch (CUDA if GPU available, CPU otherwise)
Write-Host "  Checking for NVIDIA GPU..." -ForegroundColor Gray
$nvidiaCheck = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvidiaCheck) {
    Write-Host "  NVIDIA GPU detected — installing PyTorch with CUDA 12.1" -ForegroundColor Green
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
} else {
    Write-Host "  No NVIDIA GPU — installing PyTorch CPU" -ForegroundColor Gray
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
}

# Install all other requirements
pip install -r (Join-Path $BackendDir "requirements.txt")

# Install PyInstaller
pip install pyinstaller

# -----------------------------------------------------------------------
# 3. Download AI models (for bundling)
# -----------------------------------------------------------------------
Write-Host "`nStep 3/7: Downloading AI models for bundling..." -ForegroundColor Yellow

python (Join-Path $BackendDir "download_models.py")

Write-Host "  Models downloaded to: $(Join-Path $BackendDir 'models_data')" -ForegroundColor Green

# -----------------------------------------------------------------------
# 4. Pre-download BRISQUE model weights
# -----------------------------------------------------------------------
Write-Host "`nStep 4/7: Pre-caching BRISQUE model weights..." -ForegroundColor Yellow

$brisqueScript = @"
import pyiqa
print('  Downloading BRISQUE model weights...')
model = pyiqa.create_metric('brisque', device='cpu')
print('  BRISQUE model ready.')
"@
$brisqueScript | python

# -----------------------------------------------------------------------
# 5. Build Python backend with PyInstaller
# -----------------------------------------------------------------------
Write-Host "`nStep 5/7: Building Python backend with PyInstaller..." -ForegroundColor Yellow

Set-Location $ProjectRoot

$specFile = Join-Path $BuildDir "photo-culler.spec"
$distPath = Join-Path $AppDir "python-backend-dist"
$workPath = Join-Path $BuildDir "pyinstaller-work"

pyinstaller $specFile `
    --distpath $distPath `
    --workpath $workPath `
    --clean `
    --noconfirm

# Move the built backend
if (Test-Path $PythonDistDir) {
    Remove-Item -Recurse -Force $PythonDistDir
}
New-Item -ItemType Directory -Force -Path $PythonDistDir | Out-Null
$builtBackend = Join-Path $distPath "photo-culler-backend"
Copy-Item -Recurse -Force "$builtBackend\*" $PythonDistDir

Write-Host "  Python backend built: $PythonDistDir" -ForegroundColor Green

# Deactivate venv
deactivate

# -----------------------------------------------------------------------
# 6. Build Electron frontend
# -----------------------------------------------------------------------
Write-Host "`nStep 6/7: Building Electron frontend..." -ForegroundColor Yellow

Set-Location $AppDir

if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing Node.js dependencies..." -ForegroundColor Gray
    npm install
}

npm run build
Write-Host "  Electron frontend built." -ForegroundColor Green

# -----------------------------------------------------------------------
# 7. Package as .exe installer
# -----------------------------------------------------------------------
Write-Host "`nStep 7/7: Creating Windows installer..." -ForegroundColor Yellow

npm run package:win

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "  Installer: $AppDir\dist\" -ForegroundColor Green

$exeFiles = Get-ChildItem -Path (Join-Path $AppDir "dist") -Filter "*.exe" -ErrorAction SilentlyContinue
foreach ($f in $exeFiles) {
    Write-Host "  $($f.Name)" -ForegroundColor Green
}
Write-Host "==================================================" -ForegroundColor Cyan
