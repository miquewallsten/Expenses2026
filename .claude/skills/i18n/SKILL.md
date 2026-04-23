# Skill: /i18n

Translation and multilanguage management for this financial-ops-platform.

## Language setup

| Role | Locale | File |
|------|--------|------|
| **Primary** | Spanish MX (`es`) | `web/messages/es.json` |
| **Backup** | English (`en`) | `web/messages/en.json` |

**Source of truth is always `es.json`.** English mirrors its structure. Code (variable names, key names) stays in English. Only the string *values* are translated.

---

## Subcommands

Invoke as `/i18n <subcommand> [args]`.

---

### `/i18n audit`

Find translation problems across the entire codebase. Run all checks and report findings grouped by severity.

**Check 1 — Key drift between files**

```python
import json

es = json.load(open("web/messages/es.json"))
en = json.load(open("web/messages/en.json"))

def flatten(d, prefix=""):
    out = {}
    for k, v in d.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, full))
        else:
            out[full] = v
    return out

es_flat = flatten(es)
en_flat = flatten(en)

missing_en = set(es_flat) - set(en_flat)   # In ES but not EN — must add EN backup
missing_es = set(en_flat) - set(es_flat)   # In EN but not ES — source of truth missing
```

Report each missing key with its existing value so the user can see what needs translating.

**Check 2 — Hardcoded display strings in components**

Search for JSX text content that looks like user-visible labels rather than values.

```bash
grep -rn --include="*.tsx" --include="*.ts" \
  -E '>[A-ZÁÉÍÓÚÑ][a-záéíóúñA-Z ]{3,}</|title="[A-Z]|label="[A-Z]|placeholder="[A-Z]' \
  web/components web/app \
  | grep -v "className\|aria-\|type=\|role=\|import\|//\|\.test\."
```

Also check for long Spanish strings hardcoded directly:
```bash
grep -rn --include="*.tsx" \
  -E '"[A-ZÁÉÍÓÚÑ][a-záéíóúñ ]{5,}"' \
  web/components web/app \
  | grep -v "className\|import\|//"
```

**Check 3 — `useTranslations` namespace mismatches**

For each `useTranslations("namespace")` call in a component, verify the namespace exists as a top-level key in both JSON files.

```bash
grep -rn --include="*.tsx" "useTranslations(" web/ | grep -v "node_modules\|.next"
```

Extract namespace from each call and check:
```python
import json, re
es = json.load(open("web/messages/es.json"))
namespaces = set(es.keys())
# report any useTranslations("X") where X not in namespaces
```

**Check 4 — Translation key access that may not exist**

Find `t("someKey")` calls and check whether `someKey` exists in the namespace being used.

**Report format:**

```
=== i18n Audit ===

✓ Key parity: 1284 keys in both files   ← or list missing keys
✗ Hardcoded strings found: N            ← list file:line and the string
✗ Namespace mismatches: N               ← list component and namespace
```

---

### `/i18n add <namespace.key> "<es_value>"`

Add a single translation key to both files at once.

Example: `/i18n add admin.demoMode "Modo demostración"`

Steps:
1. Parse `namespace` and `key` from the dotted path (supports nested: `admin.sections.demoMode`)
2. Open `web/messages/es.json` → navigate to the namespace → insert the key with `es_value`
3. Generate the English translation of `es_value` using your knowledge of Mexican financial/business Spanish:
   - Translate accurately, not literally
   - Use the financial domain context (this is an expense management platform)
   - Prefer professional business English equivalent
4. Open `web/messages/en.json` → navigate to the same namespace → insert the key with the English value
5. Both files must remain valid JSON with consistent indentation (2 spaces)
6. Confirm: print the two lines added

**Important insertion rules:**
- Add the new key in alphabetical order within its parent object, OR at the end if alphabetical would break readability groupings
- Never overwrite an existing key — error if the key already exists
- If the namespace doesn't exist yet, create it as a new top-level object in both files

---

### `/i18n add-namespace <namespace> <es_object_json>`

Add an entire namespace block to both files.

Example: `/i18n add-namespace vendor_payments '{"title":"Pagos a Proveedores","new":"Nuevo pago","empty":"Sin pagos registrados."}'`

Steps:
1. Verify `namespace` does not already exist in either file
2. Parse the ES JSON object
3. Add it to `es.json` under the namespace key
4. Translate every value to English and add to `en.json` under the same namespace key
5. Both files stay valid JSON
6. Print the full block added to each file

---

### `/i18n sync`

Make `en.json` a complete mirror of `es.json`'s structure, translating any missing keys.

Steps:
1. Run the key drift check (same as audit Check 1)
2. For each key in `es.json` missing from `en.json`:
   - Translate the ES value to professional business English
   - Insert it at the correct location in `en.json`
3. For each key in `en.json` missing from `es.json`:
   - Report it — do NOT delete it without confirmation, but warn it is orphaned
4. Save `en.json`
5. Run the drift check again to confirm zero missing keys

---

### `/i18n translate-file <component_path>`

Find hardcoded strings in a specific component and move them to the translation files.

Example: `/i18n translate-file web/components/admin/AdminConfigReviewPanel.tsx`

Steps:
1. Read the file
2. Identify hardcoded user-visible strings (not classNames, IDs, URLs, etc.)
3. Determine the appropriate namespace (usually matches the component's domain)
4. For each string:
   - Propose a key name (camelCase English, e.g. `expenseRulesTitle`)
   - Add to both `es.json` and `en.json` via the same logic as `/i18n add`
   - Replace the hardcoded string in the component with `t("keyName")`
5. Add `useTranslations("namespace")` to the component if not already present (import `useTranslations` from `next-intl`)
6. Confirm all changes

---

## Translation quality rules

This app is a **Mexican financial operations platform** used by finance teams. Apply these rules when generating Spanish MX values:

| Context | Use | Not |
|---------|-----|-----|
| Money | "monto", "importe" | "cantidad" (ambiguous) |
| Invoice | "factura" | "recibo" (different document) |
| Expense report | "reporte de gastos" | "informe de gastos" |
| Approval | "autorización" | "aprobación" (both work, but "autorización" is standard in MX finance) |
| Accounting entry | "póliza contable" | "entrada contable" |
| Cost center | "centro de costos" | "centro de coste" (ES Spanish) |
| Submit | "Enviar" | "Someter" (Latin American standard is "Enviar") |
| Settings | "Configuración" | "Ajustes" |
| Dashboard | "Panel" or "Tablero" | "Dashboard" (use Spanish) |
| Draft | "Borrador" | "Preliminar" |

Formal register (usted-form implied), never casual. Finance terminology should match SAT (Mexican tax authority) vocabulary where applicable.

---

## File format rules

- Indentation: **2 spaces**
- No trailing commas
- Keys in `"camelCase"` English
- String values in the locale's language
- Preserve all existing keys and ordering
- Both files must be valid JSON after every operation — verify with `python3 -m json.tool web/messages/es.json > /dev/null`

---

## What NOT to do

- Never delete a key from `es.json` without explicit user confirmation
- Never use machine-translate APIs or external services
- Never change key names in one file without changing them in the other
- Never add emoji or informal language to translation values
- Never use `any` type or skip type safety when editing JSON in TypeScript components
