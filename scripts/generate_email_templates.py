"""One-off generator for Phase 1.2 email templates.

Run from repo root:
    python3 scripts/generate_email_templates.py

Idempotent — overwrites existing template files.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "packages/modules/channels/templates/email"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ── Per-template content (Spanish source, English mirror) ─────────────────────

TEMPLATES = {
    "magic_link": {
        "es": {
            "subject": "Tu enlace de acceso",
            "intro": "Hola {{ user.full_name }},",
            "body": (
                "Recibimos una solicitud para acceder a tu cuenta. "
                "Haz clic en el botón a continuación para iniciar sesión. "
                "El enlace caduca en {{ ttl_minutes }} minutos."
            ),
            "cta": "Iniciar sesión",
            "footer": "Si no solicitaste este enlace, ignora este correo.",
        },
        "en": {
            "subject": "Your sign-in link",
            "intro": "Hi {{ user.full_name }},",
            "body": (
                "We received a request to access your account. "
                "Click the button below to sign in. "
                "The link expires in {{ ttl_minutes }} minutes."
            ),
            "cta": "Sign in",
            "footer": "If you didn't request this, ignore this email.",
        },
        "vars": {"link_var": "link", "data": []},
    },
    "expense_submitted_to_approver": {
        "es": {
            "subject": "Nuevo gasto pendiente de tu aprobación",
            "intro": "Hola {{ approver.full_name }},",
            "body": (
                "{{ submitter.full_name }} envió un gasto que requiere tu aprobación."
            ),
            "cta": "Revisar gasto",
            "footer": "",
        },
        "en": {
            "subject": "New expense awaiting your approval",
            "intro": "Hi {{ approver.full_name }},",
            "body": (
                "{{ submitter.full_name }} submitted an expense that needs your approval."
            ),
            "cta": "Review expense",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Importe", "Amount", "${{ expense.amount }} {{ expense.currency }}"),
                ("Concepto", "Description", "{{ expense.description }}"),
                ("Fecha", "Date", "{{ expense.expense_date }}"),
            ],
        },
    },
    "expense_approved_to_submitter": {
        "es": {
            "subject": "Tu gasto fue aprobado",
            "intro": "Hola {{ submitter.full_name }},",
            "body": (
                "Tu gasto fue aprobado por {{ approver.full_name }}. "
                "Continuará el flujo de pago según las políticas de tu empresa."
            ),
            "cta": "Ver gasto",
            "footer": "",
        },
        "en": {
            "subject": "Your expense was approved",
            "intro": "Hi {{ submitter.full_name }},",
            "body": (
                "{{ approver.full_name }} approved your expense. "
                "It will continue through the payment flow per your company policy."
            ),
            "cta": "View expense",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Importe", "Amount", "${{ expense.amount }} {{ expense.currency }}"),
                ("Concepto", "Description", "{{ expense.description }}"),
            ],
        },
    },
    "expense_rejected_to_submitter": {
        "es": {
            "subject": "Tu gasto fue rechazado",
            "intro": "Hola {{ submitter.full_name }},",
            "body": (
                "{{ approver.full_name }} rechazó tu gasto. "
                "Revisa el motivo y, si corresponde, envíalo nuevamente con los ajustes."
            ),
            "cta": "Ver detalle",
            "footer": "",
        },
        "en": {
            "subject": "Your expense was rejected",
            "intro": "Hi {{ submitter.full_name }},",
            "body": (
                "{{ approver.full_name }} rejected your expense. "
                "Review the reason and, if appropriate, resubmit with adjustments."
            ),
            "cta": "View details",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Motivo", "Reason", "{{ reason | default('—') }}"),
                ("Importe", "Amount", "${{ expense.amount }} {{ expense.currency }}"),
            ],
        },
    },
    "expense_returned_to_submitter": {
        "es": {
            "subject": "Tu gasto fue devuelto para corregir",
            "intro": "Hola {{ submitter.full_name }},",
            "body": (
                "{{ approver.full_name }} devolvió tu gasto solicitando información adicional. "
                "Una vez corregido, vuelve a enviarlo."
            ),
            "cta": "Corregir gasto",
            "footer": "",
        },
        "en": {
            "subject": "Your expense was returned for revision",
            "intro": "Hi {{ submitter.full_name }},",
            "body": (
                "{{ approver.full_name }} returned your expense requesting more information. "
                "Once corrected, resubmit it."
            ),
            "cta": "Edit expense",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Comentario", "Comment", "{{ comment | default('—') }}"),
            ],
        },
    },
    "approval_nudge_48h": {
        "es": {
            "subject": "Recordatorio: gasto pendiente desde hace 48 h",
            "intro": "Hola {{ approver.full_name }},",
            "body": (
                "Este gasto enviado por {{ submitter.full_name }} lleva más de 48 horas "
                "esperando tu aprobación."
            ),
            "cta": "Revisar ahora",
            "footer": "",
        },
        "en": {
            "subject": "Reminder: expense pending for 48 h",
            "intro": "Hi {{ approver.full_name }},",
            "body": (
                "This expense submitted by {{ submitter.full_name }} has been waiting "
                "for your approval for more than 48 hours."
            ),
            "cta": "Review now",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Importe", "Amount", "${{ expense.amount }} {{ expense.currency }}"),
                ("Enviado", "Submitted", "{{ expense.submitted_at }}"),
            ],
        },
    },
    "daily_digest_approver": {
        "es": {
            "subject": "Resumen diario: {{ items | length }} gasto(s) por aprobar",
            "intro": "Hola {{ approver.full_name }},",
            "body": "Tienes los siguientes gastos pendientes de revisión:",
            "cta": "Ir a la bandeja",
            "footer": "",
        },
        "en": {
            "subject": "Daily digest: {{ items | length }} expense(s) to approve",
            "intro": "Hi {{ approver.full_name }},",
            "body": "You have the following expenses awaiting your review:",
            "cta": "Open queue",
            "footer": "",
        },
        "vars": {"link_var": "link", "data": [], "is_digest": True},
    },
    "payment_sent_to_employee": {
        "es": {
            "subject": "Tu reembolso fue procesado",
            "intro": "Hola {{ submitter.full_name }},",
            "body": (
                "Procesamos el reembolso de tu gasto. El depósito puede tardar 1-3 días "
                "hábiles en reflejarse según tu banco."
            ),
            "cta": "Ver detalle",
            "footer": "",
        },
        "en": {
            "subject": "Your reimbursement was processed",
            "intro": "Hi {{ submitter.full_name }},",
            "body": (
                "We processed the reimbursement for your expense. Deposits may take "
                "1–3 business days to reflect depending on your bank."
            ),
            "cta": "View details",
            "footer": "",
        },
        "vars": {
            "link_var": "link",
            "data": [
                ("Importe", "Amount", "${{ amount }} {{ currency }}"),
                ("Referencia", "Reference", "{{ reference | default('—') }}"),
            ],
        },
    },
}


def render_html(name: str, locale: str, t: dict, vars_meta: dict) -> str:
    is_digest = vars_meta.get("is_digest", False)
    data_block = ""
    if vars_meta["data"]:
        rows = []
        for label_es, label_en, value in vars_meta["data"]:
            label = label_es if locale == "es" else label_en
            rows.append(
                f'      <div class="row"><dt>{label}:</dt> <dd>{value}</dd></div>'
            )
        data_block = (
            "    <dl class=\"data\">\n" + "\n".join(rows) + "\n    </dl>\n"
        )

    digest_block = ""
    if is_digest:
        digest_block = (
            '    <ul style="padding-left: 18px; margin: 12px 0;">\n'
            "    {% for item in items %}\n"
            "      <li style=\"margin: 6px 0; font-size: 13px;\">\n"
            "        <strong>${{ item.amount }} {{ item.currency }}</strong>"
            " — {{ item.description }} <span class=\"meta\">"
            "({{ item.submitter_name }})</span>\n"
            "      </li>\n"
            "    {% endfor %}\n"
            "    </ul>\n"
        )

    cta = (
        '    <p style="margin-top: 20px;">\n'
        f'      <a href="{{{{ {vars_meta["link_var"]} }}}}" class="btn">{t["cta"]}</a>\n'
        "    </p>\n"
    )

    return (
        '{% extends "_layout.html" %}\n'
        "{% block content %}\n"
        f"  <h1>{t['subject']}</h1>\n"
        f"  <p>{t['intro']}</p>\n"
        f"  <p>{t['body']}</p>\n"
        f"{digest_block}"
        f"{data_block}"
        f"{cta}"
        "{% endblock %}\n"
    )


def render_text(t: dict, vars_meta: dict, locale: str) -> str:
    parts = [t["intro"], "", t["body"]]
    if vars_meta["data"]:
        parts.append("")
        for label_es, label_en, value in vars_meta["data"]:
            label = label_es if locale == "es" else label_en
            parts.append(f"  {label}: {value}")
    if vars_meta.get("is_digest"):
        parts.append("")
        parts.append(
            "{% for item in items %}- ${{ item.amount }} {{ item.currency }} — "
            "{{ item.description }} ({{ item.submitter_name }})\n{% endfor %}"
        )
    parts.append("")
    parts.append("{{ " + vars_meta["link_var"] + " }}")
    if t["footer"]:
        parts.append("")
        parts.append(t["footer"])
    return "\n".join(parts) + "\n"


def main() -> None:
    for name, payload in TEMPLATES.items():
        vars_meta = payload["vars"]
        for locale in ("es", "en"):
            t = payload[locale]
            base = ROOT / locale / name
            write(base / "subject.txt", t["subject"] + "\n")
            write(base / "body.txt", render_text(t, vars_meta, locale))
            write(base / "body.html", render_html(name, locale, t, vars_meta))
    print(f"Generated {len(TEMPLATES) * 2} template directories under {ROOT}")


if __name__ == "__main__":
    main()
