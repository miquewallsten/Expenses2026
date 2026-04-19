"""accounting_category_ai_service.py

Generates a starter set of accounting categories for a company based on a
plain-language prompt and the company's setup data.

Design notes
------------
* Deterministic — no external AI or LLM call yet.  Heuristics read the prompt
  and company_setup dict to pick the right category mix and tax treatment.
* Output is a plain list of dicts that callers can POST to
  POST /admin/accounting-categories or bulk-insert directly.
* Account codes are sequential placeholders (6000, 6001, …).  They are
  deliberately simple; companies are expected to review and override them.
* Capped at 10 categories max regardless of heuristics match count.

Return shape (each item)
------------------------
{
    "code":                   str,        # short machine key e.g. "TRAVEL"
    "name":                   str,        # human label
    "expense_account_code":   str,        # debit GL placeholder
    "liability_account_code": str,        # credit / settlement account key
    "tax_behavior":           str,        # "creditable" | "non_creditable" | "none"
    "requires_project":       bool,
}
"""

from __future__ import annotations

# ── Category catalogue ────────────────────────────────────────────────────────
# Each entry is a template; heuristics select/mutate from this list.
# Fields: code, name, liability_account_code, tax_behavior, requires_project
# (expense_account_code is assigned sequentially by the generator)

_CATALOGUE: list[dict] = [
    {
        "code":                   "TRAVEL",
        "name":                   "Travel Expenses",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "MEALS",
        "name":                   "Meals & Entertainment",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "non_creditable",
        "requires_project":       False,
    },
    {
        "code":                   "SOFTWARE",
        "name":                   "Software & Subscriptions",
        "liability_account_code": "card_clearing",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "OFFICE",
        "name":                   "Office Supplies",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "PROFESSIONAL_SERVICES",
        "name":                   "Professional Services",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "MARKETING",
        "name":                   "Marketing & Advertising",
        "liability_account_code": "card_clearing",
        "tax_behavior":           "non_creditable",
        "requires_project":       False,
    },
    {
        "code":                   "TRAINING",
        "name":                   "Training & Education",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "UTILITIES",
        "name":                   "Utilities",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "MAINTENANCE",
        "name":                   "Maintenance & Repairs",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "creditable",
        "requires_project":       False,
    },
    {
        "code":                   "MISCELLANEOUS",
        "name":                   "Miscellaneous",
        "liability_account_code": "employee_payable",
        "tax_behavior":           "none",
        "requires_project":       False,
    },
]

# Codes included when the company looks like a services / consulting firm.
_SERVICES_CORE = {"TRAVEL", "MEALS", "SOFTWARE", "OFFICE", "PROFESSIONAL_SERVICES"}

# Maximum number of categories to return.
_MAX_CATEGORIES = 10

# Starting GL debit account number.
_BASE_ACCOUNT = 6000


# ── Heuristic helpers ─────────────────────────────────────────────────────────

def _is_mexico(prompt: str, company_setup: dict) -> bool:
    """Return True when the company appears to be Mexico-based."""
    country = str(company_setup.get("country", "") or "").lower()
    if country in {"mx", "mexico", "méxico"}:
        return True
    # Prompt keywords
    lower = prompt.lower()
    return any(kw in lower for kw in ("mexico", "méxico", "mx", "sat", "cfdi", "iva"))


def _is_services_company(prompt: str, company_setup: dict) -> bool:
    """Return True when the company looks like a services / consulting firm."""
    industry = str(company_setup.get("industry", "") or "").lower()
    if any(kw in industry for kw in ("service", "consult", "technolog", "softwar", "agency")):
        return True
    lower = prompt.lower()
    return any(
        kw in lower
        for kw in (
            "service", "consult", "technolog", "softwar", "agency",
            "professional", "saas", "b2b",
        )
    )


def _is_project_based(prompt: str, company_setup: dict) -> bool:
    """Return True when the company operates in a project-based model."""
    lower = prompt.lower()
    return any(
        kw in lower
        for kw in ("project", "client billing", "billable", "per project", "by project")
    ) or bool(company_setup.get("project_required"))


# ── Public entry point ────────────────────────────────────────────────────────

def generate_accounting_categories(
    prompt: str,
    company_setup: dict,
) -> list[dict]:
    """
    Return a starter list of accounting category dicts for *company_setup*
    guided by *prompt*.

    Parameters
    ----------
    prompt : str
        Plain-language description of the company, e.g. "Mexico-based
        consulting firm, project-based billing, mostly travel and software".
    company_setup : dict
        Partial or full company setup data.  Recognised keys:
          country (str)     — ISO or free-text country name
          industry (str)    — free-text industry
          project_required (bool) — whether projects are mandatory

    Returns
    -------
    list[dict]
        Up to 10 category dicts ready to be persisted via
        POST /admin/accounting-categories.  Does not include company_id —
        callers must inject that before persisting.
    """
    mexico        = _is_mexico(prompt, company_setup)
    services      = _is_services_company(prompt, company_setup)
    project_based = _is_project_based(prompt, company_setup)

    # ── Select categories ─────────────────────────────────────────────────────
    # Services companies get the core 5; others get a broader general mix.
    if services:
        priority_codes  = list(_SERVICES_CORE)
        # Supplement with general categories up to the cap.
        supplement = [
            e["code"] for e in _CATALOGUE if e["code"] not in _SERVICES_CORE
        ]
        selected_codes = priority_codes + supplement
    else:
        selected_codes = [e["code"] for e in _CATALOGUE]

    selected_codes = selected_codes[:_MAX_CATEGORIES]

    # Build a lookup for fast template access.
    catalogue_by_code = {e["code"]: e for e in _CATALOGUE}

    # ── Apply heuristics and assign GL codes ──────────────────────────────────
    result: list[dict] = []
    account_counter = _BASE_ACCOUNT

    for code in selected_codes:
        template = dict(catalogue_by_code[code])  # shallow copy — safe for flat dict

        # Mexico → override tax_behavior to "creditable" except for categories
        # that are inherently non-creditable (meals/entertainment).
        if mexico and template["tax_behavior"] == "none":
            template["tax_behavior"] = "creditable"

        # Project-based company → most categories require a project.
        # Exempt MISCELLANEOUS and MEALS (usually personal / non-billable).
        if project_based and code not in {"MISCELLANEOUS", "MEALS"}:
            template["requires_project"] = True

        result.append({
            "code":                   template["code"],
            "name":                   template["name"],
            "expense_account_code":   str(account_counter),
            "liability_account_code": template["liability_account_code"],
            "tax_behavior":           template["tax_behavior"],
            "requires_project":       template["requires_project"],
        })
        account_counter += 1

    return result
