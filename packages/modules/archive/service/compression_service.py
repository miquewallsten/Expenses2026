"""Service for compressing files before storage."""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

logger = logging.getLogger(__name__)

# Quality preset DPI values
QUALITY_DPI = {
    "low": 72,
    "medium": 150,
    "high": 300,
}


class CompressionService:
    """Service for compressing files before storage.

    CFDI (XML) is the official document - PDFs are visual complements
    that can be compressed to reduce storage costs.
    """

    DEFAULT_MAX_SIZE_KB = 500  # 500 KB default max for PDFs
    IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
    PDF_EXTENSIONS = {"pdf"}
    XML_EXTENSIONS = {"xml"}

    def __init__(self) -> None:
        """Initialize compression service."""
        self._pikepdf_available = self._check_pikepdf()
        self._ghostscript_available = self._check_ghostscript()

    def _check_pikepdf(self) -> bool:
        """Check if pikepdf is available."""
        try:
            import pikepdf  # noqa: F401

            return True
        except ImportError:
            logger.debug("pikepdf not available, PDF compression will use Ghostscript fallback")
            return False

    def _check_ghostscript(self) -> bool:
        """Check if Ghostscript is available."""
        try:
            result = subprocess.run(
                ["gs", "--version"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except (subprocess.SubprocessError, FileNotFoundError):
            logger.debug("Ghostscript not available, PDF compression will be limited")
            return False

    def is_pdf(self, content: bytes) -> bool:
        """Check if content is a PDF file.

        Args:
            content: Raw file content

        Returns:
            True if content starts with PDF header
        """
        return content.startswith(b"%PDF")

    def get_file_type(self, filename: str) -> str:
        """Get the file extension (lowercased).

        Args:
            filename: The filename to extract extension from

        Returns:
            Lowercase extension without the dot
        """
        return Path(filename).suffix.lower().lstrip(".")

    def should_compress(self, filename: str, content: bytes, max_size_kb: int) -> bool:
        """Determine if a file should be compressed.

        Args:
            filename: The filename
            content: Raw file content
            max_size_kb: Maximum size threshold in KB

        Returns:
            True if file should be compressed
        """
        file_type = self.get_file_type(filename)

        # XML files should NEVER be compressed (they're official CFDIs)
        if file_type in self.XML_EXTENSIONS:
            return False

        # Only compress PDFs and images
        if file_type not in self.PDF_EXTENSIONS and file_type not in self.IMAGE_EXTENSIONS:
            return False

        # Check size threshold
        size_kb = len(content) / 1024
        return size_kb > max_size_kb

    def compress_pdf(
        self,
        content: bytes,
        max_size_kb: int = 500,
        quality: Literal["low", "medium", "high"] = "medium",
    ) -> bytes:
        """Compress a PDF file.

        Attempts compression in order:
        1. pikepdf (lossless optimization)
        2. Ghostscript (lossy compression)

        Args:
            content: Raw PDF content
            max_size_kb: Target maximum size in KB
            quality: Compression quality preset (low=72dpi, medium=150dpi, high=300dpi)

        Returns:
            Compressed PDF content, or original if compression fails
        """
        # Return original if it's already under threshold
        current_size_kb = len(content) / 1024
        if current_size_kb <= max_size_kb:
            logger.debug(f"PDF already under threshold ({current_size_kb:.1f}KB <= {max_size_kb}KB)")
            return content

        # Verify it's actually a PDF
        if not self.is_pdf(content):
            logger.warning("compress_pdf called with non-PDF content")
            return content

        # Try pikepdf first (lossless)
        if self._pikepdf_available:
            try:
                compressed = self._compress_with_pikepdf(content)
                if len(compressed) < len(content):
                    logger.info(
                        f"Pikepdf compressed PDF from {len(content)} to {len(compressed)} bytes"
                    )
                    # Check if it meets target
                    if len(compressed) / 1024 <= max_size_kb:
                        return compressed
                    # Use the compressed version as input for Ghostscript
                    content = compressed
            except Exception as e:
                logger.warning(f"Pikepdf compression failed: {e}")

        # Try Ghostscript if pikepdf didn't meet target
        if self._ghostscript_available:
            try:
                compressed = self._compress_with_ghostscript(content, quality)
                if len(compressed) < len(content):
                    logger.info(
                        f"Ghostscript compressed PDF from {len(content)} to {len(compressed)} bytes"
                    )
                    return compressed
            except Exception as e:
                logger.warning(f"Ghostscript compression failed: {e}")

        # Return original if all compression attempts failed
        logger.warning("PDF compression failed, returning original content")
        return content

    def _compress_with_pikepdf(self, content: bytes) -> bytes:
        """Compress PDF using pikepdf (lossless).

        Args:
            content: Raw PDF content

        Returns:
            Compressed PDF content
        """
        import pikepdf

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_in:
            tmp_in.write(content)
            tmp_in.flush()

            try:
                with pikepdf.open(tmp_in.name) as pdf:
                    # Optimize: remove duplicates, compress streams
                    pdf.save(
                        tmp_in.name + ".compressed",
                        linearize=True,
                        compress_streams=True,
                        object_stream_mode=pikepdf.ObjectStreamMode.generate,
                    )

                with open(tmp_in.name + ".compressed", "rb") as f:
                    return f.read()
            finally:
                # Cleanup temp files
                Path(tmp_in.name).unlink(missing_ok=True)
                Path(tmp_in.name + ".compressed").unlink(missing_ok=True)

    def _compress_with_ghostscript(
        self, content: bytes, quality: Literal["low", "medium", "high"] = "medium"
    ) -> bytes:
        """Compress PDF using Ghostscript (lossy).

        Args:
            content: Raw PDF content
            quality: Quality preset determining DPI

        Returns:
            Compressed PDF content
        """
        dpi = QUALITY_DPI.get(quality, 150)

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_in:
            tmp_in.write(content)
            tmp_in.flush()

            output_path = tmp_in.name + ".compressed"

            try:
                # Use Ghostscript to compress PDF
                result = subprocess.run(
                    [
                        "gs",
                        "-sDEVICE=pdfwrite",
                        "-dCompatibilityLevel=1.4",
                        f"-dPDFSETTINGS=/{quality}",
                        f"-dColorImageResolution={dpi}",
                        f"-dGrayImageResolution={dpi}",
                        f"-dMonoImageResolution={dpi}",
                        "-dNOPAUSE",
                        "-dQUIET",
                        "-dBATCH",
                        f"-sOutputFile={output_path}",
                        tmp_in.name,
                    ],
                    capture_output=True,
                    timeout=60,
                )

                if result.returncode != 0:
                    logger.warning(f"Ghostscript failed: {result.stderr.decode()}")
                    return content

                with open(output_path, "rb") as f:
                    return f.read()
            finally:
                # Cleanup temp files
                Path(tmp_in.name).unlink(missing_ok=True)
                Path(output_path).unlink(missing_ok=True)

    def compress_file(
        self,
        filename: str,
        content: bytes,
        max_size_kb: int = 500,
        quality: Literal["low", "medium", "high"] = "medium",
    ) -> bytes:
        """Compress a file based on its type.

        Args:
            filename: The filename (used for type detection)
            content: Raw file content
            max_size_kb: Maximum size threshold in KB
            quality: Compression quality preset

        Returns:
            Compressed content, or original if compression not needed/possible
        """
        file_type = self.get_file_type(filename)

        # XML files should NEVER be compressed
        if file_type in self.XML_EXTENSIONS:
            return content

        # Only compress PDFs and images over threshold
        if not self.should_compress(filename, content, max_size_kb):
            return content

        # Compress PDFs
        if file_type in self.PDF_EXTENSIONS:
            if self.is_pdf(content):
                return self.compress_pdf(content, max_size_kb, quality)
            logger.warning(f"File {filename} has .pdf extension but is not a PDF")
            return content

        # Images: future implementation placeholder
        # Currently return unchanged
        if file_type in self.IMAGE_EXTENSIONS:
            logger.debug(f"Image compression not yet implemented for {filename}")
            return content

        return content


# Module-level singleton for convenience
_compression_service: CompressionService | None = None


def get_compression_service() -> CompressionService:
    """Get the compression service singleton.

    Returns:
        CompressionService instance
    """
    global _compression_service
    if _compression_service is None:
        _compression_service = CompressionService()
    return _compression_service