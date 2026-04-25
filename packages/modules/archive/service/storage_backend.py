"""Storage backend abstraction for the archive module.

Supports two backends selected via ``ARCHIVE_STORAGE_BACKEND``:

- ``local``  (default) — writes bytes to a local directory tree.
                         Active backend for development.
- ``object``            — uploads bytes to any S3-compatible object store.
                         Reserved for production use; not active by default.

Canonical environment variables
--------------------------------
ARCHIVE_STORAGE_BACKEND        "local" | "object"      (default: "local")

Local backend:
  ARCHIVE_LOCAL_STORAGE_DIR    base directory           (default: "./storage")

Object storage backend (provider-neutral names):
  ARCHIVE_OBJECT_CONTAINER     bucket / container name  (required)
  ARCHIVE_OBJECT_PREFIX        optional key prefix      (default: "")
  ARCHIVE_OBJECT_ENDPOINT      custom endpoint URL      (optional, e.g. MinIO)
  ARCHIVE_OBJECT_REGION        region name              (default: "us-east-1")
  ARCHIVE_OBJECT_ACCESS_KEY    access key id            (optional)
  ARCHIVE_OBJECT_SECRET_KEY    secret access key        (optional)

Legacy fallback names (still accepted, lower priority than canonical names):
  STORAGE_BACKEND → ARCHIVE_STORAGE_BACKEND
  LOCAL_STORAGE_DIR → ARCHIVE_LOCAL_STORAGE_DIR
  S3_BUCKET → ARCHIVE_OBJECT_CONTAINER
  S3_ENDPOINT_URL → ARCHIVE_OBJECT_ENDPOINT
  S3_REGION → ARCHIVE_OBJECT_REGION

Usage
-----
    backend = get_storage_backend()
    result = backend.save_bytes(
        company_id=1,
        original_filename="receipt.pdf",
        file_bytes=b"...",
        folder_hint="2026/04/expenses",   # pre-rendered by archive_service
        filename_hint="expense_42_2026-04-18",
    )
    # result = {
    #     "storage_key": "1/2026/04/expenses/expense_42_2026-04-18_a1b2c3d4.pdf",
    #     "original_filename": "receipt.pdf",
    #     "file_type": "pdf",
    #     "storage_backend": "local",
    # }
"""

from __future__ import annotations

import os
import re
import uuid
from pathlib import Path


# ── Config helpers ─────────────────────────────────────────────────────────────

def _env(canonical: str, *legacy: str, default: str = "") -> str:
    """Return the first non-empty value from canonical → legacy → default."""
    for key in (canonical, *legacy):
        val = os.environ.get(key, "").strip()
        if val:
            return val
    return default


# ── Path-safety helpers ────────────────────────────────────────────────────────

# Characters allowed in a single path segment used inside a storage key.
# Anything outside this set is replaced with "_" to prevent injection.
_SAFE_SEGMENT = re.compile(r"[^A-Za-z0-9._\-]")


def _sanitize_segment(value: str) -> str:
    """Make a single logical segment safe for use inside a storage key.

    - Replaces path separators and disallowed chars with ``_``
    - Strips leading dots to prevent hidden-file / relative-path tricks
    - Collapses consecutive underscores so output stays readable
    - Returns ``_`` if the result would be empty
    """
    # Normalise OS separators → forward slash, then strip
    value = value.replace("\\", "/").replace("/", "_")
    # Replace anything outside the safe set
    value = _SAFE_SEGMENT.sub("_", value)
    # Remove leading dots (e.g. "..", ".hidden")
    value = value.lstrip(".")
    # Collapse runs of underscores
    value = re.sub(r"_+", "_", value).strip("_")
    return value or "_"


# ── Shared helpers ─────────────────────────────────────────────────────────────


def _ext(filename: str) -> str:
    """Return lowercased extension without leading dot, or 'bin' as fallback."""
    return Path(filename).suffix.lstrip(".").lower() or "bin"


def _key_parts(company_id: int, folder_hint: str | None) -> list[str]:
    """Build path segments: ``[company_id, *folder_hint_segments]``.

    *folder_hint* is expected to be a pre-rendered, slash-separated path
    (e.g. ``"2026/04/expenses"``).  Each segment is sanitized individually
    so that slashes are preserved as path separators rather than collapsed.

    The backend does NOT add its own date-based prefix — date components
    are the responsibility of the caller (archive_service renders them from
    the per-company archive config pattern).
    """
    parts = [str(company_id)]
    if folder_hint:
        for segment in folder_hint.strip("/").split("/"):
            seg = _sanitize_segment(segment)
            if seg and seg != "_":
                parts.append(seg)
    return parts


def _unique_filename(original_filename: str, filename_hint: str | None) -> str:
    """Build the final filename component for a storage key.

    Uses *filename_hint* (if provided) as the human-readable stem and
    preserves the extension from *original_filename*.  A short UUID suffix
    guarantees uniqueness while keeping the hint readable at the front.

    Example:
        original_filename = "receipt.pdf"
        filename_hint     = "expense_42_2026-04-18"
        → "expense_42_2026-04-18_a1b2c3d4.pdf"
    """
    ext = _ext(original_filename)
    stem = _sanitize_segment(filename_hint) if filename_hint else _sanitize_segment(Path(original_filename).stem)
    return f"{stem}_{uuid.uuid4().hex[:8]}.{ext}"


# ── Local backend — current default for development ───────────────────────────


class LocalStorageBackend:
    """Stores files in a directory tree on the local filesystem.

    This is the active default backend for development. File bytes are written
    to::

        {base_dir}/{company_id}/{folder_hint...}/{stem}_{uuid8}.{ext}

    *folder_hint* is a pre-rendered, slash-separated path supplied by
    ``archive_service`` (e.g. ``"2026/04/expenses"``).  Each segment is
    sanitized individually to prevent path traversal while preserving the
    intended directory hierarchy.
    """

    def __init__(self, base_dir: str = "./storage") -> None:
        self._base = Path(base_dir).resolve()

    def save_bytes(
        self,
        company_id: int,
        original_filename: str,
        file_bytes: bytes,
        folder_hint: str | None = None,
        filename_hint: str | None = None,
    ) -> dict:
        parts = _key_parts(company_id, folder_hint)
        dest_dir = self._base.joinpath(*parts)
        dest_dir.mkdir(parents=True, exist_ok=True)

        unique_name = _unique_filename(original_filename, filename_hint)
        dest_path = dest_dir / unique_name

        # Guard: resolved path must stay inside base_dir (defence-in-depth).
        # _sanitize_segment should already prevent traversal, but verify here.
        try:
            dest_path.resolve().relative_to(self._base)
        except ValueError:
            raise ValueError(
                f"Resolved destination path escapes storage base: {dest_path}"
            )

        dest_path.write_bytes(file_bytes)

        # storage_key is relative to base_dir — portable across deployments
        # with different absolute base paths.
        storage_key = "/".join(parts + [unique_name])

        return {
            "storage_key": storage_key,
            "original_filename": original_filename,
            "file_type": _ext(original_filename),
            "storage_backend": "local",
        }

    def delete_bytes(self, storage_key: str) -> bool:
        """Permanently remove the file at *storage_key*. No-op if missing."""
        # Reject absolute keys and traversal — storage_key is stored relative.
        if not storage_key or storage_key.startswith("/") or ".." in storage_key.split("/"):
            return False
        target = (self._base / storage_key).resolve()
        try:
            target.relative_to(self._base)
        except ValueError:
            return False
        try:
            target.unlink(missing_ok=True)
            return True
        except OSError:
            return False

    def read_bytes(self, storage_key: str) -> bytes | None:
        """Return the file bytes at *storage_key*, or ``None`` if not found."""
        if not storage_key or storage_key.startswith("/") or ".." in storage_key.split("/"):
            return None
        target = (self._base / storage_key).resolve()
        try:
            target.relative_to(self._base)
        except ValueError:
            return None
        try:
            return target.read_bytes()
        except OSError:
            return None


# ── Object storage backend — reserved for production use ──────────────────────


class ObjectStorageBackend:
    """Stores files in any S3-compatible object store (AWS S3, MinIO, GCS, etc.).

    This backend is reserved for production deployments. Activate it by setting
    ``ARCHIVE_STORAGE_BACKEND=object`` along with the required container name.

    Object key structure:
        {prefix?}{company_id}/{folder_hint...}/{stem}_{uuid8}.{ext}
    """

    def __init__(
        self,
        container: str,
        prefix: str = "",
        endpoint_url: str | None = None,
        region: str = "us-east-1",
        access_key: str | None = None,
        secret_key: str | None = None,
    ) -> None:
        try:
            import boto3  # type: ignore[import]
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for the object storage backend. "
                "Install it with: pip install boto3"
            ) from exc

        import boto3  # noqa: F811 — re-import after guard so type checker sees it

        self._container = container
        self._prefix = prefix.rstrip("/") + "/" if prefix else ""

        kwargs: dict = {"region_name": region}
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        if access_key and secret_key:
            kwargs["aws_access_key_id"] = access_key
            kwargs["aws_secret_access_key"] = secret_key

        self._client = boto3.client("s3", **kwargs)

    def save_bytes(
        self,
        company_id: int,
        original_filename: str,
        file_bytes: bytes,
        folder_hint: str | None = None,
        filename_hint: str | None = None,
    ) -> dict:
        parts = _key_parts(company_id, folder_hint)
        unique_name = _unique_filename(original_filename, filename_hint)
        storage_key = self._prefix + "/".join(parts + [unique_name])

        self._client.put_object(
            Bucket=self._container,
            Key=storage_key,
            Body=file_bytes,
        )

        return {
            "storage_key": storage_key,
            "original_filename": original_filename,
            "file_type": _ext(original_filename),
            "storage_backend": "object",
        }

    def delete_bytes(self, storage_key: str) -> bool:
        """Permanently remove the object at *storage_key*. No-op if missing."""
        if not storage_key:
            return False
        try:
            self._client.delete_object(Bucket=self._container, Key=storage_key)
            return True
        except Exception:  # noqa: BLE001 — best-effort; DB row still removed
            return False

    def read_bytes(self, storage_key: str) -> bytes | None:
        """Return the file bytes at *storage_key*, or ``None`` if not found."""
        if not storage_key:
            return None
        try:
            resp = self._client.get_object(Bucket=self._container, Key=storage_key)
            return resp["Body"].read()
        except Exception:  # noqa: BLE001
            return None


# ── Factory ────────────────────────────────────────────────────────────────────


def get_storage_backend(db_cfg: dict | None = None) -> "LocalStorageBackend | ObjectStorageBackend":
    """Return a storage backend instance.

    Preference order:
    1. *db_cfg* — dict with keys matching StorageConfig fields (passed by
       archive_service after fetching the active StorageConfig row).
    2. Environment variables (``ARCHIVE_STORAGE_BACKEND`` etc.).
    3. Hardcoded default: ``local`` with ``./storage``.
    """
    if db_cfg:
        backend = (db_cfg.get("backend") or "").lower() or _env("ARCHIVE_STORAGE_BACKEND", "STORAGE_BACKEND", default="local").lower()
    else:
        backend = _env("ARCHIVE_STORAGE_BACKEND", "STORAGE_BACKEND", default="local").lower()

    # NAS is treated identically to local — it's a mounted path
    if backend in ("local", "nas"):
        base_dir = (
            db_cfg.get("local_path") if db_cfg else None
        ) or _env("ARCHIVE_LOCAL_STORAGE_DIR", "LOCAL_STORAGE_DIR", default="./storage")
        return LocalStorageBackend(base_dir=base_dir)

    if backend in ("s3", "object", "azure"):
        container = (
            (db_cfg.get("bucket") or db_cfg.get("azure_container")) if db_cfg else None
        ) or _env("ARCHIVE_OBJECT_CONTAINER", "S3_BUCKET")
        if not container:
            raise RuntimeError(
                "A bucket/container name is required for S3 or Azure storage. "
                "Set it in Admin → Storage Config or via ARCHIVE_OBJECT_CONTAINER."
            )
        return ObjectStorageBackend(
            container=container,
            prefix=(db_cfg.get("prefix") if db_cfg else None) or _env("ARCHIVE_OBJECT_PREFIX"),
            endpoint_url=(db_cfg.get("endpoint_url") if db_cfg else None) or _env("ARCHIVE_OBJECT_ENDPOINT", "S3_ENDPOINT_URL") or None,
            region=(db_cfg.get("region") if db_cfg else None) or _env("ARCHIVE_OBJECT_REGION", "S3_REGION", default="us-east-1"),
            access_key=_env("ARCHIVE_OBJECT_ACCESS_KEY") or None,
            secret_key=_env("ARCHIVE_OBJECT_SECRET_KEY") or None,
        )

    # Unknown backend — fall back to local
    base_dir = _env("ARCHIVE_LOCAL_STORAGE_DIR", "LOCAL_STORAGE_DIR", default="./storage")
    return LocalStorageBackend(base_dir=base_dir)
