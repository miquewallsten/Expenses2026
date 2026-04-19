_CATEGORY_MAP = {
    "transport": "travel",
    "lodging": "travel",
    "meals": "meals",
    "travel": "travel",
}


def normalize_category(category: str | None) -> str | None:
    if category is None:
        return None
    cleaned = category.strip().lower()
    return _CATEGORY_MAP.get(cleaned, cleaned)
