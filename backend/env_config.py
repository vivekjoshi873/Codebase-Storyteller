"""Load project-root .env before any other backend module reads os.environ."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

# override=True ensures .env wins over stale Windows/user env vars.
load_dotenv(ENV_FILE, override=True)


def openai_key_suffix() -> str:
    key = os.getenv("OPENAI_API_KEY", "")
    return key[-4:] if len(key) >= 4 else "????"
