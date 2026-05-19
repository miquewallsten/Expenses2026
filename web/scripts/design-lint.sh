#!/usr/bin/env bash
# design-lint.sh — Enforces design system rules. Run before every commit.
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0

check() {
  local label="$1" expected="$2"
  shift 2
  local actual
  actual=$("$@" 2>/dev/null | tr -d '[:space:]')
  if [ "$actual" != "$expected" ]; then
    echo "FAIL [$label]: expected $expected, got $actual"
    FAIL=1
  else
    echo "  OK [$label]"
  fi
}

echo "═══ Design Lint ═══"

check "hardcoded-hex" "0" grep -c '#[0-9a-fA-F]\{6\}' <<< "$(grep -rn '#[0-9a-fA-F]\{6\}' components/ modules/ app/ --include='*.tsx' | grep -v 'globals.css\|content=\|var(\|#000000\|#F2F2F7\|metaTag')"

check "white-opacity" "0" grep -c '.' <<< "$(grep -rn 'border-white\|divide-white\|ring-white\|bg-white/' components/ modules/ app/ --include='*.tsx' | grep -v 'bg-white shadow\|bg-white transition\|bg-white/70')"

check "gradients" "0" grep -c '.' <<< "$(grep -rn 'bg-gradient' components/ modules/ app/ --include='*.tsx')"

check "em-dashes" "0" grep -c '.' <<< "$(grep -rn ' — ' components/ modules/ app/ --include='*.tsx' | grep -v '\/\/')"

check "local-status-maps" "0" grep -c '.' <<< "$(grep -rn 'STATUS_CLS\|STATUS_CONFIG\|STATUS_COLORS' modules/ --include='*.tsx' | grep -v 'status-styles')"

check "side-stripes" "0" grep -c '.' <<< "$(grep -rn 'border-l-[2-9]\|border-l-4\|border-l-[3-9]' components/ modules/ app/ --include='*.tsx')"

check "hero-metrics" "0" grep -c '.' <<< "$(grep -rn 'text-[4-9]xl' components/ modules/ app/ --include='*.tsx')"

check "glassmorphism" "0" grep -c '.' <<< "$(grep -rn 'blur-2xl\|blur-3xl' components/ modules/ app/ --include='*.tsx')"

echo ""
if [ "$FAIL" = "0" ]; then
  echo "✓ All checks passed."
  exit 0
else
  echo "✗ Some checks FAILED. Fix before committing."
  exit 1
fi

# Super Admin specific checks
check "sa-custom-nav" "0" grep -c '.' <<< "$(grep -rn 'flex h-\[44px\].*border-b.*nav\|flex h-9.*items-center.*gap-0.5.*border-b.*bg-surface-1.*px-2' app/super-admin/ --include='*.tsx')"

check "sa-hardcoded-strings" "0" grep -c '.' <<< "$(grep -rn 'Platform Administration\|Verifying access\|Logout' app/super-admin/layout.tsx)"

check "sa-persona-hex" "0" grep -c '.' <<< "$(grep -rn 'bg-blue-500/20 text-blue-400\|bg-red-500/20 text-red-400\|bg-green-500/20 text-green-400' app/super-admin/ components/super-admin/ --include='*.tsx')"

check "sa-nested-layout" "0" ls app/super-admin/agent-center/layout.tsx 2>/dev/null | wc -l
