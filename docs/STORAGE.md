# Storage & data model — how an expense, its files, and its XML fit together

This is the canonical answer to: *"Where do uploaded files go? Where is parsed
XML kept? How does a company back everything up?"*

---

## 1. The three places data lives

| Layer                 | What it holds                                                     | Backed by                                    |
| --------------------- | ----------------------------------------------------------------- | -------------------------------------------- |
| **PostgreSQL**        | All metadata + extracted text + validation results                | `DATABASE_URL` (docker volume `pg_data`)     |
| **Object storage**    | The raw bytes of every uploaded PDF / XML / image                 | Docker volume `archive_storage` → `/app/storage` |
| **Derived on demand** | Parsed CFDI fields (UUID, emisor, conceptos, timbre, totals…)     | Computed from `content_text` at render time |

There is no fourth place. If Postgres + `archive_storage` are both backed up,
you have a complete, restorable record of every expense.

---

## 2. Raw files — where they go on disk

Entry point: `packages/modules/archive/service/archive_service.store_file()`.

Every upload (expense attachment, XML, OCR'd image, generated Poliza bundle,
etc.) flows through this single function. It delegates the bytes to the
active storage backend (`ARCHIVE_STORAGE_BACKEND`, default `local`).

**Local backend path convention** (`storage_backend.LocalStorageBackend`):

```
{ARCHIVE_LOCAL_STORAGE_DIR}/{company_id}/{folder_hint}/{stem}_{uuid8}.{ext}
```

- `ARCHIVE_LOCAL_STORAGE_DIR = /app/storage` inside the container.
- `folder_hint` comes from per-company `ArchiveConfig.folder_pattern`
  (default `{year}/{month}`), rendered with tokens `{company}`, `{date}`,
  `{year}`, `{month}`, `{expense_id}`, `{filename}`.
- `stem` comes from `file_pattern` (default `{company}_{date}_{expense_id}`).
- `uuid8` is an 8-char random suffix — guarantees uniqueness without
  overwriting.
- Extension is always taken from the original upload.

Real example currently on disk:
```
/app/storage/1/2026/04/company1_2026-04-23_8f3ac2d1.xml
```

All path segments are sanitised (`_sanitize_segment`) — no traversal, no
hidden files. The backend also defence-in-depth verifies the resolved path
stays under the base dir.

### Swapping to S3 / MinIO

Set `ARCHIVE_STORAGE_BACKEND=object` and provide:
- `ARCHIVE_OBJECT_CONTAINER` (bucket)
- `ARCHIVE_OBJECT_ENDPOINT` (optional — for MinIO / R2 / custom)
- `ARCHIVE_OBJECT_REGION`, `ARCHIVE_OBJECT_ACCESS_KEY`, `ARCHIVE_OBJECT_SECRET_KEY`
- `ARCHIVE_OBJECT_PREFIX` (optional)

The `storage_key` column in `archive_files` is backend-agnostic — it's just
the opaque key that the backend knows how to resolve.

---

## 3. Database — what's persisted

### `archive_files` — the inventory of every binary
One row per file ever uploaded.

| Column              | Notes                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| `id`                | PK                                                                     |
| `company_id`        | Tenant owner (index)                                                   |
| `expense_id`        | Nullable FK → `expenses.id`. Backfilled when the file is paired.       |
| `file_name`         | Original upload filename                                               |
| `file_type`         | Lowercased extension (`pdf`, `xml`, `jpg`…)                            |
| `source_type`       | `expense` \| `manual` \| `import`                                      |
| `storage_backend`   | `local` \| `object`                                                    |
| `storage_key`       | Opaque key; relative to base dir on local, object key on S3            |
| `content_text`      | Text extracted from the bytes (see §4)                                 |
| `document_type`     | Triage classification (`cfdi_xml`, `cfdi_pdf`, `receipt_pdf`, …)       |
| `validation_summary`| Human-readable validation outcome                                      |
| `created_at`        | Audit timestamp                                                        |

### `expenses` — the business record
Canonical expense fields only (amount, description, expense_date, status,
workflow stage, approver chain, CFDI identifiers that are queried often).
**No CFDI subtree is stored here.** Only the *derived* summary fields that
are useful as filter/sort keys.

### `expense_documents` — the working copy used by the UI
Per-expense view of documents. Mirrors `archive_files.content_text` for the
expense detail panel and triage pipeline. Fields: `expense_id`, `filename`,
`document_type`, `content_text`.

### `validation_results` — machine validation history
One row per validation event per document:
`SAT_VALIDATION`, `XML_FORMAT`, `UUID_PRESENT`, `MISSING_PDF`, `POLICY_CHECK`…
Used to render the review badges and to block approval on failures.

### `audit_log`
Append-only record of every create/update/transition — who did what when.

---

## 4. Parsed XML data — *not* a stored table

This is the part that surprises people. CFDI XML is **not** shredded into
normalised tables. The *entire* invoice body is stored as text in
`archive_files.content_text` (and mirrored to `expense_documents.content_text`).

Whenever the backend or UI needs structured CFDI fields, it calls
`xml_extraction_service.extract_xml_fields(content_text)` which returns a
flat dict:

```
uuid, total, subtotal, moneda, tipo_comprobante, metodo_pago, forma_pago,
fecha, serie, folio, lugar_expedicion, emisor_rfc, emisor_nombre,
emisor_regimen, receptor_rfc, receptor_nombre, receptor_uso_cfdi,
conceptos_count, conceptos_summary, conceptos[…],
impuestos_totales_trasladados, impuestos_totales_retenidos, …
```

Only three of these fields are ever *persisted* onto `expenses`:
- `amount`        ← `Comprobante/@Total`
- `description`   ← `Emisor/@Nombre` (falling back to first concepto)
- `expense_date`  ← `Comprobante/@Fecha`

Everything else is re-parsed on demand. This means:
- The XML is always the source of truth.
- A CFDI schema change cannot desync the DB.
- Backup = preserve `content_text` + the original file in archive storage.

---

## 5. How everything links to an expense

```
expenses.id
 ├── expense_documents.expense_id  (working copies for UI / triage)
 ├── archive_files.expense_id      (inventory of raw binaries on disk/S3)
 ├── validation_results.expense_id (per-document validation history)
 ├── workflow_transitions.expense_id (approval chain events)
 └── audit_log.entity_id + entity_type="expense"
```

Pairing logic (PDF ↔ XML) runs on every upload:
1. **PDF arrives** — OCR + `extract_cfdi_qr_identity` on the image; match
   UUID/RFC/total against existing XMLs on the same expense.
2. **XML arrives** — `match_pdf_to_xml_by_cfdi_identity`; attach to an
   existing orphan PDF if and only if that PDF's expense has no XML yet
   (prevents hijacking).

See `packages/modules/expenses/service/document_service.py` and
`packages/modules/expenses/api/router.py` (`/documents/upload`).

---

## 6. Backup strategy

To have a complete, restorable snapshot you need **both** layers captured at
the same point in time:

### 6.1 Nightly full backup

```bash
# 1. Dump Postgres (schema + data)
docker compose exec -T db pg_dump -U postgres -Fc financial_ops \
  > backups/$(date +%F)/financial_ops.dump

# 2. Snapshot the archive volume
docker run --rm \
  -v financial-ops-platform_archive_storage:/src:ro \
  -v "$(pwd)/backups/$(date +%F):/dst" \
  alpine tar czf /dst/archive_storage.tar.gz -C /src .
```

Keep the two files together. `archive_files.storage_key` paths resolve
relative to the archive volume root, so the two artefacts must travel as
a pair.

### 6.2 Restore

```bash
# 1. Restore the archive volume
docker run --rm \
  -v financial-ops-platform_archive_storage:/dst \
  -v "$(pwd)/backups/2026-04-30:/src:ro" \
  alpine sh -c "cd /dst && tar xzf /src/archive_storage.tar.gz"

# 2. Restore Postgres
docker compose exec -T db pg_restore -U postgres -d financial_ops --clean \
  < backups/2026-04-30/financial_ops.dump
```

### 6.3 Future: per-company export endpoint

Planned: `GET /admin/export/company/{id}` streams a ZIP containing:
- `manifest.json` (every expense + its linked documents + validation history)
- `files/…` (every `archive_files` row for that company, laid out by
  `storage_key`)
- `schema/…` (a JSON-Schema description of `manifest.json`)

This gives each customer an offline, self-contained archive without
requiring DB access.

### 6.4 Future: object-storage mirror

When `ARCHIVE_STORAGE_BACKEND=object` is enabled for prod, add a second
bucket with versioning + cross-region replication. Postgres still needs its
own backup path (e.g. managed snapshot + PITR).

---

## 7. Known gaps (to fix)

- **Duplicate archive rows.** Uploading the same filename twice creates two
  rows (different `storage_key` suffixes). Storage is safe but the DB has
  clutter. Fix: dedupe by (`company_id`, SHA-256 of bytes) before insert.
- **`expense_documents` vs `archive_files` divergence.** They hold the same
  `content_text` today. Long-term, `expense_documents` should become a
  lightweight view over `archive_files` (no duplicate text).
- **No per-company export endpoint yet.** See 6.3.
