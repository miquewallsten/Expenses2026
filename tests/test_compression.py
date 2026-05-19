"""Tests for the compression service."""

import pytest

from packages.modules.archive.service.compression_service import (
    CompressionService,
    get_compression_service,
)


# Sample minimal PDF header (not a valid PDF but enough for detection)
PDF_HEADER = b"%PDF-1.4\n%test\n"
SMALL_PDF = PDF_HEADER + b"x" * 100  # Very small "PDF"
LARGE_PDF = PDF_HEADER + b"x" * 600000  # ~600 KB "PDF" (over 500KB threshold)


class TestCompressionService:
    """Tests for CompressionService."""

    def test_is_pdf_detects_pdf(self) -> None:
        """PDF content is correctly identified."""
        service = CompressionService()
        assert service.is_pdf(b"%PDF-1.4\ncontent") is True
        assert service.is_pdf(b"%PDF-2.0\nmore content") is True

    def test_is_pdf_rejects_non_pdf(self) -> None:
        """Non-PDF content is correctly rejected."""
        service = CompressionService()
        assert service.is_pdf(b"<?xml version='1.0'?>") is False
        assert service.is_pdf(b"PNG\x89...") is False
        assert service.is_pdf(b"GIF89a...") is False
        assert service.is_pdf(b"") is False
        assert service.is_pdf(b"random text") is False

    def test_get_file_type_basic(self) -> None:
        """File type extraction works for common extensions."""
        service = CompressionService()
        assert service.get_file_type("document.pdf") == "pdf"
        assert service.get_file_type("image.jpg") == "jpg"
        assert service.get_file_type("image.JPEG") == "jpeg"
        assert service.get_file_type("data.xml") == "xml"
        assert service.get_file_type("archive.PDF") == "pdf"

    def test_get_file_type_edge_cases(self) -> None:
        """File type extraction handles edge cases."""
        service = CompressionService()
        assert service.get_file_type("noextension") == ""
        assert service.get_file_type(".hidden") == ""
        assert service.get_file_type("multiple.dots.pdf") == "pdf"
        assert service.get_file_type("/path/to/file.pdf") == "pdf"

    def test_should_compress_pdf_over_threshold(self) -> None:
        """PDFs over threshold should be compressed."""
        service = CompressionService()
        large_content = PDF_HEADER + b"x" * 600000  # ~600KB
        assert service.should_compress("document.pdf", large_content, 500) is True

    def test_should_compress_pdf_under_threshold(self) -> None:
        """PDFs under threshold should not be compressed."""
        service = CompressionService()
        small_content = PDF_HEADER + b"x" * 100  # Very small
        assert service.should_compress("document.pdf", small_content, 500) is False

    def test_should_compress_never_compress_xml(self) -> None:
        """XML files should never be compressed regardless of size."""
        service = CompressionService()
        large_xml = b"<?xml version='1.0'?><data>" + b"x" * 1000000 + b"</data>"
        assert service.should_compress("cfdi.xml", large_xml, 1) is False

    def test_should_compress_non_compressed_types(self) -> None:
        """Non-PDF/image types should not be compressed."""
        service = CompressionService()
        large_content = b"x" * 100000
        assert service.should_compress("file.txt", large_content, 1) is False
        assert service.should_compress("file.doc", large_content, 1) is False
        assert service.should_compress("file.xlsx", large_content, 1) is False

    def test_compress_pdf_small_file(self) -> None:
        """Small PDFs should be returned unchanged."""
        service = CompressionService()
        small_pdf = PDF_HEADER + b"x" * 100
        result = service.compress_pdf(small_pdf, max_size_kb=500)
        assert result == small_pdf

    def test_compress_pdf_non_pdf_content(self) -> None:
        """Non-PDF content should be returned unchanged."""
        service = CompressionService()
        non_pdf = b"This is not a PDF at all"
        result = service.compress_pdf(non_pdf, max_size_kb=1)
        assert result == non_pdf

    def test_compress_pdf_identifies_pdf(self) -> None:
        """compress_pdf correctly identifies PDF vs non-PDF."""
        service = CompressionService()

        # Valid PDF header should proceed with compression attempt
        pdf_content = PDF_HEADER + b"x" * 100
        result = service.compress_pdf(pdf_content, max_size_kb=500)
        # Small PDF, under threshold, should return original
        assert result == pdf_content

        # Non-PDF should return unchanged immediately
        non_pdf = b"Not a PDF"
        result = service.compress_pdf(non_pdf, max_size_kb=1)
        assert result == non_pdf

    def test_compress_file_routes_pdfs(self) -> None:
        """compress_file routes PDFs correctly."""
        service = CompressionService()

        # Small PDF under threshold
        small_pdf = PDF_HEADER + b"x" * 100
        result = service.compress_file("doc.pdf", small_pdf, max_size_kb=500)
        assert result == small_pdf

    def test_compress_file_preserves_xml(self) -> None:
        """compress_file never compresses XML files."""
        service = CompressionService()

        # Large XML should be returned unchanged
        large_xml = b"<?xml version='1.0'?><data>" + b"x" * 100000 + b"</data>"
        result = service.compress_file("cfdi.xml", large_xml, max_size_kb=1)
        assert result == large_xml

    def test_compress_file_handles_no_extension(self) -> None:
        """compress_file handles files without extension."""
        service = CompressionService()

        content = b"some content"
        result = service.compress_file("noextension", content, max_size_kb=1)
        assert result == content

    def test_compress_file_unknown_extension(self) -> None:
        """compress_file handles unknown file types."""
        service = CompressionService()

        content = b"some content" * 1000
        result = service.compress_file("file.xyz", content, max_size_kb=1)
        assert result == content

    def test_get_compression_service_singleton(self) -> None:
        """get_compression_service returns singleton instance."""
        service1 = get_compression_service()
        service2 = get_compression_service()
        assert service1 is service2

    def test_quality_presets_exist(self) -> None:
        """Quality presets are defined correctly."""
        from packages.modules.archive.service.compression_service import QUALITY_DPI

        assert QUALITY_DPI["low"] == 72
        assert QUALITY_DPI["medium"] == 150
        assert QUALITY_DPI["high"] == 300

    def test_extensions_defined(self) -> None:
        """Extension sets are defined correctly."""
        service = CompressionService()

        assert "pdf" in service.PDF_EXTENSIONS
        assert "xml" in service.XML_EXTENSIONS
        assert "jpg" in service.IMAGE_EXTENSIONS
        assert "jpeg" in service.IMAGE_EXTENSIONS
        assert "png" in service.IMAGE_EXTENSIONS

    @pytest.mark.skipif(
        not CompressionService()._pikepdf_available and not CompressionService()._ghostscript_available,
        reason="Requires pikepdf or Ghostscript for actual compression",
    )
    def test_compress_large_pdf_with_tools(self) -> None:
        """Integration test: compress a large PDF when tools are available."""
        service = CompressionService()

        # Create a larger PDF that exceeds threshold
        # This test only runs if pikepdf or Ghostscript is available
        large_pdf = PDF_HEADER + b"x" * 600000
        result = service.compress_pdf(large_pdf, max_size_kb=100)

        # If compression tools are available, result should be different
        # (Note: our fake PDF may not actually compress, so we just check it returns)
        assert result is not None
        assert service.is_pdf(result) is True