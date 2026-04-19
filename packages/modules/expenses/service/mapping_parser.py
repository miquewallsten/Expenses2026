def parse_account_mapping(config_text: str) -> dict[str, str]:
    result = {}
    for line in config_text.splitlines():
        parts = line.split("->")
        if len(parts) != 2:
            continue
        key = parts[0].strip().lower()
        value = parts[1].strip()
        if key and value:
            result[key] = value
    return result
