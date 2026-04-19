_XML_SIGNALS = ("<?xml", "<cfdi:", "TimbreFiscalDigital", "<Comprobante")


def classify_document(filename: str, content_text: str | None) -> str:
    """
    Classify an uploaded expense document.

    Returns one of: "cfdi_xml", "pdf_unclassified", "cfdi_pdf", "ticket"
    """
    text = content_text or ""
    lower_name = filename.lower()
    lower_text = text.lower()

    # A. Content-first: definitive XML signals
    if text and any(sig in text for sig in _XML_SIGNALS):
        return "cfdi_xml"

    # B. Extension-based XML
    if lower_name.endswith(".xml"):
        return "cfdi_xml"

    # C. PDF extension — unclassified; pairing to CFDI XML is handled separately
    if lower_name.endswith(".pdf"):
        return "pdf_unclassified"

    # D. Everything else
    if "factura" in lower_text or "uuid" in lower_text:
        return "cfdi_pdf"
    return "ticket"
