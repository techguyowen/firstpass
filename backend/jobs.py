import threading
from typing import Dict
from .schemas.photo import JobStatus

# Global job tracking
jobs: Dict[str, JobStatus] = {}
jobs_lock = threading.Lock()
