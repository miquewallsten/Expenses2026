"""Email template rendering.

Templates live in ``packages/modules/channels/templates/email/{locale}/``.
Each template directory contains:
  - ``subject.txt``   — single-line subject (Jinja2 expression OK).
  - ``body.txt``      — plain-text fallback.
  - ``body.html``     — full HTML body. Should ``{% extends "_layout.html" %}``.

A shared ``_layout.html`` provides the dark-enterprise frame (header, footer,
CTA button macro). Individual templates override the ``{% block content %}``.

Usage:
    rendered = render_email(
        template="expense_submitted_to_approver",
        locale="es",
        ctx={"expense": ..., "submitter": ..., "approver": ...},
    )
    notifier.send(db, NotifyRequest(..., message=rendered))
"""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from packages.modules.channels.service.notifier import RenderedMessage

_TEMPLATE_ROOT = Path(__file__).parent / "templates" / "email"
_DEFAULT_LOCALE = "es"
_SUPPORTED_LOCALES = ("es", "en")


def _env_for(locale: str) -> Environment:
    locale = locale if locale in _SUPPORTED_LOCALES else _DEFAULT_LOCALE
    loader = FileSystemLoader(
        [
            str(_TEMPLATE_ROOT / locale),
            str(_TEMPLATE_ROOT),  # for shared _layout.html
        ]
    )
    env = Environment(
        loader=loader,
        autoescape=select_autoescape(("html", "xml")),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env


def render_email(
    template: str,
    locale: str = _DEFAULT_LOCALE,
    ctx: dict | None = None,
) -> RenderedMessage:
    """Render subject + plain text + html for the given template name + locale."""
    ctx = ctx or {}
    env = _env_for(locale)

    subject = env.get_template(f"{template}/subject.txt").render(**ctx).strip()
    text = env.get_template(f"{template}/body.txt").render(**ctx).strip()
    html = env.get_template(f"{template}/body.html").render(**ctx)

    return RenderedMessage(subject=subject, text=text, html=html)


def list_available_templates() -> list[str]:
    """Return the list of template names available in the default locale."""
    base = _TEMPLATE_ROOT / _DEFAULT_LOCALE
    if not base.exists():
        return []
    return sorted(p.name for p in base.iterdir() if p.is_dir())
