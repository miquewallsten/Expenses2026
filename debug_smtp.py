#!/usr/bin/env python3
"""Debug script to check SMTP configuration."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

from apps.api.routes.auth import _SMTP_HOST, _SMTP_PORT, _SMTP_USER

def debug_smtp():
    """Debug SMTP configuration."""
    print("SMTP Configuration:")
    print(f"SMTP_HOST: {_SMTP_HOST}")
    print(f"SMTP_PORT: {_SMTP_PORT}")
    print(f"SMTP_USER: {_SMTP_USER}")
    print(f"SMTP configured: {bool(_SMTP_HOST)}")

if __name__ == "__main__":
    debug_smtp()