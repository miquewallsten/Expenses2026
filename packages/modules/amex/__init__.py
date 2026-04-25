"""Amex Reconciliation module.

Lets a dedicated user (``is_amex_reconciler``) upload a monthly American
Express statement (CSV), then upload the CFDI XML/PDF pairs that correspond
to the statement line items. The backend auto-matches by (amount, date)
and exposes endpoints for manual match, project/category assignment, and
final submission — at which point the whole statement becomes one aggregate
Expense attached to an ExpenseReport that flows through the normal approval
pipeline.

All routes are gated by ``require_module("amex_reconciliation")`` so an
uninstalled add-on is invisible.
"""
