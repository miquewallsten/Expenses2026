def run_sat_validation(content_text: str) -> dict:
    text = content_text.lower()

    if "cancelled" in text:
        return {
            "sat_status": "cancelled",
            "is_valid": False,
            "message": "SAT check (basic) — invoice appears cancelled",
        }

    if "uuid" in text or "xml" in text or "factura" in text:
        return {
            "sat_status": "valid",
            "is_valid": True,
            "message": "SAT check (basic) — not live validation",
        }

    return {
        "sat_status": "unknown",
        "is_valid": False,
        "message": "SAT check (basic) — could not confirm validity",
    }
