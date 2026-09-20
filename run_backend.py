"""
FirstPass — Entry Point for Standalone Binary & Server
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path so 'backend' is recognized as a top-level package
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.main import app
import uvicorn
import logging

logger = logging.getLogger("firstpass")

if __name__ == "__main__":
    PORT = int(os.environ.get("FIRSTPASS_PORT", os.environ.get("PHOTO_CULLER_PORT", 58765)))
    logger.info(f"Starting server on port {PORT}...")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=PORT,
        log_level="info",
        loop="asyncio",
    )
