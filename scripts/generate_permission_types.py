#!/usr/bin/env python3
"""Generate web/types/permissions.ts from PERMISSION_CATALOG.

Run: python3 scripts/generate_permission_types.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from packages.core.platform.service_permissions import PERMISSION_CATALOG

keys = sorted(PERMISSION_CATALOG.keys())

lines = [
    "/**",
    " * Auto-generated permission keys from packages/core/platform/service_permissions.py",
    " * DO NOT EDIT MANUALLY — run: python3 scripts/generate_permission_types.py",
    " */",
    "",
    "export type PermissionKey =",
]
for i, key in enumerate(keys):
    suffix = ";" if i == len(keys) - 1 else ""
    lines.append(f'  | "{key}"{suffix}')

lines.append("")
lines.append("/** Every permission key as a readonly array for runtime checks */")
lines.append("export const PERMISSION_KEYS: readonly PermissionKey[] = [")
for key in keys:
    lines.append(f'  "{key}",')
lines.append("] as const;")
lines.append("")

content = "\n".join(lines)

output_path = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "web", "types", "permissions.ts"
)
with open(output_path, "w") as f:
    f.write(content)

print(f"Generated {len(keys)} permission keys → {output_path}")
