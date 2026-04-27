"""Proactive insight scanners.

Each scanner returns a list of ``InsightCandidate`` dicts:
``{"kind", "severity", "title", "body", "data_json", "suggested_prompt"}``.
"""

from __future__ import annotations

from .runner import InsightCandidate, run_scanners, run_for_all_companies

__all__ = ["InsightCandidate", "run_scanners", "run_for_all_companies"]
