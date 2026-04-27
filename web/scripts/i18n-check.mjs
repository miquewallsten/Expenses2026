#!/usr/bin/env node
/* Phase 3.5 — i18n drift gate.
 *
 * Verifies:
 *  1) web/messages/es.json and en.json have identical key sets (no drift).
 *  2) Every t("key") reference in web/{app,components,modules,lib} resolves
 *     to a key that exists in BOTH locales — when we can statically resolve
 *     which `useTranslations(ns)` binding the variable points at.
 *
 * Strategy: we look for `const <var> = useTranslations("ns")` /
 * `getTranslations("ns")` / `getTranslations({ namespace: "ns" })` and only
 * validate `<var>(...)` calls. Dynamic namespaces and dynamic keys are skipped.
 *
 * Flags:
 *   --parity-only   Only run check 1 (key-set parity). Exits non-zero only on
 *                   drift between es.json/en.json. Used as a strict CI gate
 *                   while orphan t()-references are being mopped up.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PARITY_ONLY = process.argv.includes("--parity-only");

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const MESSAGES_DIR = join(ROOT, "messages");
const SCAN_DIRS = ["app", "components", "modules", "lib"]
  .map((d) => join(ROOT, d))
  .filter((d) => existsSync(d));

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// ── 1. Key-set parity ────────────────────────────────────────────────────────
const es = flatten(loadJson(join(MESSAGES_DIR, "es.json")));
const en = flatten(loadJson(join(MESSAGES_DIR, "en.json")));

const esKeys = new Set(Object.keys(es));
const enKeys = new Set(Object.keys(en));

const onlyEs = [...esKeys].filter((k) => !enKeys.has(k)).sort();
const onlyEn = [...enKeys].filter((k) => !esKeys.has(k)).sort();

let failed = false;
if (onlyEs.length || onlyEn.length) {
  failed = true;
  console.error("✗ i18n key drift between es.json and en.json:");
  if (onlyEs.length) {
    console.error(`  Missing in en.json (${onlyEs.length}):`);
    for (const k of onlyEs.slice(0, 50)) console.error(`    - ${k}`);
    if (onlyEs.length > 50) console.error(`    … +${onlyEs.length - 50} more`);
  }
  if (onlyEn.length) {
    console.error(`  Missing in es.json (${onlyEn.length}):`);
    for (const k of onlyEn.slice(0, 50)) console.error(`    - ${k}`);
    if (onlyEn.length > 50) console.error(`    … +${onlyEn.length - 50} more`);
  }
}

// ── 2. Used keys exist in both locales ───────────────────────────────────────
const BINDING_RE =
  /\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:\{\s*namespace\s*:\s*)?["'`]([\w.-]+)["'`]/g;

const missing = [];
let validated = 0;

if (!PARITY_ONLY) {
  for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    // Track ALL bindings per variable name (a file may shadow `t` in
    // multiple scopes/components). For each call, we accept the key if it
    // resolves under ANY of the file's bindings for that variable —
    // ambiguous but conservatively avoids false positives.
    const bindings = new Map(); // varName -> Set<namespace>
    for (const m of src.matchAll(BINDING_RE)) {
      const [, varName, ns] = m;
      if (!bindings.has(varName)) bindings.set(varName, new Set());
      bindings.get(varName).add(ns);
    }
    if (bindings.size === 0) continue;

    for (const [varName, namespaces] of bindings) {
      const callRe = new RegExp(
        `\\b${varName}(?:\\.(?:rich|raw))?\\s*\\(\\s*["'\`]([\\w.-]+)["'\`]`,
        "g",
      );
      for (const m of src.matchAll(callRe)) {
        const key = m[1];
        validated++;
        const candidates = [...namespaces].map((ns) => `${ns}.${key}`);
        const resolvedInBoth = candidates.find(
          (full) => esKeys.has(full) && enKeys.has(full),
        );
        if (!resolvedInBoth) {
          // Pick the candidate "closest" to existing — prefer one that
          // exists in at least one locale; fall back to the first.
          const best =
            candidates.find((full) => esKeys.has(full) || enKeys.has(full)) ||
            candidates[0];
          missing.push({
            file: file.replace(ROOT + "/", ""),
            ns: [...namespaces].join("|"),
            key,
            full: best,
          });
        }
      }
    }
  }
}
}

if (missing.length) {
  failed = true;
  console.error(
    `✗ ${missing.length} t(...) reference(s) point at missing keys (out of ${validated} validated):`,
  );
  for (const m of missing.slice(0, 50)) {
    const where =
      !esKeys.has(m.full) && !enKeys.has(m.full)
        ? "BOTH"
        : !esKeys.has(m.full)
          ? "es.json"
          : "en.json";
    console.error(`  - ${m.file}: t("${m.key}") → ${m.full} (missing in ${where})`);
  }
  if (missing.length > 50) console.error(`  … +${missing.length - 50} more`);
}

if (failed) process.exit(1);

console.log(
  PARITY_ONLY
    ? `OK — i18n parity (${esKeys.size} keys) [parity-only].`
    : `OK — i18n parity (${esKeys.size} keys), ${validated} t() references validated across ${SCAN_DIRS.length} dirs.`,
);
