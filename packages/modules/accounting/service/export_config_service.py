"""export_config_service.py

Renders ExportConfig patterns against a runtime context dict.

render_filename(config, context) -> str
render_folder(config, context)   -> str

Context keys (all optional — missing keys are left as-is):
    company   — company identifier / slug
    date      — export date string (formatted by caller)
    batch_id  — unique batch identifier for this export run
    year      — 4-digit year string
    month     — 2-digit month string
"""

from __future__ import annotations

import re

from packages.core.platform.models_export_config import ExportConfig


def _render(pattern: str, context: dict) -> str:
    """Replace all {key} tokens in *pattern* with values from *context*.

    Unknown tokens are left unchanged so partial contexts do not silently
    produce empty segments.
    """
    def _replace(match: re.Match) -> str:
        key = match.group(1)
        return str(context[key]) if key in context else match.group(0)

    return re.sub(r"\{(\w+)\}", _replace, pattern)


def render_filename(config: ExportConfig, context: dict) -> str:
    """Return the rendered output filename for *config* given *context*."""
    return _render(config.file_pattern, context)


def render_folder(config: ExportConfig, context: dict) -> str:
    """Return the rendered output folder path for *config* given *context*."""
    return _render(config.folder_pattern, context)
