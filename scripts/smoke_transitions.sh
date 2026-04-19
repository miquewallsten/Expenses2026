#!/usr/bin/env bash
# smoke_transitions.sh
#
# Minimal developer smoke test for transition_service.py scenarios.
# Run against a live dev server: uvicorn apps.api.main:app --reload
#
# Usage:
#   bash scripts/smoke_transitions.sh [EXPENSE_ID] [BASE_URL]
#
# Defaults: expense id=1, http://127.0.0.1:8000
#
# Preconditions (reset via sqlite3 if needed):
#   sqlite3 financial_ops.db "UPDATE expenses SET status='draft' WHERE id=1;"
#
# The script runs four scenarios in order.  Each prints the HTTP status and the
# "status" or "detail" field from the response so results are readable without
# piping through json.tool.

set -euo pipefail

ID="${1:-1}"
BASE="${2:-http://127.0.0.1:8000}"
HEADER="X-User-Id: 1"

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}  PASS${RESET} $*"; }
fail() { echo -e "${RED}  FAIL${RESET} $*"; }
info() { echo -e "${YELLOW}  ----${RESET} $*"; }

check() {
  local label="$1" url="$2" expect_http="$3" expect_field="$4" expect_value="$5"
  echo ""
  info "Scenario: $label"
  echo "  POST $url"

  local response http_code body
  response=$(curl -s -w "\n%{http_code}" -X POST "$url" -H "$HEADER")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n -1)

  # Extract the target field value with basic grep (no jq dependency)
  local actual
  actual=$(echo "$body" | grep -o "\"${expect_field}\":\"[^\"]*\"" | head -1 \
           | sed 's/.*":"\(.*\)"/\1/')

  echo "  HTTP $http_code  |  $expect_field: ${actual:-<not found>}"

  if [[ "$http_code" != "$expect_http" ]]; then
    fail "Expected HTTP $expect_http, got $http_code"
    echo "  Body: $body"
    return 1
  fi

  if [[ -n "$expect_value" && "$actual" != *"$expect_value"* ]]; then
    fail "Expected $expect_field to contain \"$expect_value\", got \"$actual\""
    echo "  Body: $body"
    return 1
  fi

  ok "$label"
}

echo "============================================================"
echo " Transition service smoke tests"
echo " Expense id: $ID   Base URL: $BASE"
echo "============================================================"

# ── Scenario 1: draft → submitted ────────────────────────────────────────────
# Precondition: expense must be in "draft".
# To reset: sqlite3 financial_ops.db "UPDATE expenses SET status='draft' WHERE id=$ID;"
check \
  "draft expense can be submitted" \
  "$BASE/expenses/review-actions/$ID/submit" \
  "200" "status" "submitted"

# ── Scenario 2: manager action blocked when manager flow is disabled ──────────
# Precondition: expense in "submitted"; approval_mode must be "accounting_only"
# or another non-manager mode so manager flow is disabled.
check \
  "manager action blocked when manager flow disabled" \
  "$BASE/expenses/review-actions/$ID/manager-approve" \
  "400" "detail" "manager flow is not enabled"

# ── Scenario 3: accounting action blocked on draft expense ────────────────────
# Precondition: expense in "draft" (wrong state for accounting).
# Reset: sqlite3 financial_ops.db "UPDATE expenses SET status='draft' WHERE id=$ID;"
check \
  "accounting action blocked on draft expense" \
  "$BASE/expenses/review-actions/$ID/accounting-approve" \
  "400" "detail" "cannot be actioned by accounting"

# ── Scenario 4: accounting approve on reviewable submitted expense ─────────────
# Precondition: expense in "submitted"; accounting_review_mode set to a non-empty
# value (e.g. "all"); approval_mode != "manager_then_accounting".
# Reset: sqlite3 financial_ops.db "UPDATE expenses SET status='submitted' WHERE id=$ID;"
check \
  "accounting approve works on reviewable submitted expense" \
  "$BASE/expenses/review-actions/$ID/accounting-approve" \
  "200" "status" "approved"

echo ""
echo "============================================================"
echo " Done."
echo "============================================================"
