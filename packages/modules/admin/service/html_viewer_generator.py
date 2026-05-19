"""HTML offline viewer generator for tenant exports.

Generates a self-contained HTML file that clients can open in any browser
without needing a server or internet connection.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any


class HTMLViewerGenerator:
    """Generate offline-viewable HTML for exported data.

    Produces self-contained HTML files with:
    - Spanish language interface
    - Dark blue header (#1a365d)
    - Tab navigation for data types
    - Summary cards with totals
    - Search/filter functionality
    - Responsive design for mobile
    """

    def __init__(self):
        self.template_dir = Path(__file__).parent.parent / "templates"

    def _load_template(self) -> str:
        """Load the HTML template.

        Returns:
            Template content as string
        """
        template_path = self.template_dir / "export_viewer.html"
        if template_path.exists():
            return template_path.read_text(encoding="utf-8")
        # Fallback embedded template
        return self._get_default_template()

    def _get_default_template(self) -> str:
        """Return default embedded template.

        Used as fallback when template file is not found.
        """
        return """<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ company_name }} - Exportación de Datos</title>
    <style>
        body { font-family: sans-serif; background: #f5f5f5; }
        header { background: #1a365d; color: white; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; }
    </style>
</head>
<body>
    <header><h1>{{ company_name }}</h1></header>
    <div class="container">
        <div id="data"></div>
    </div>
    <script>
        const EXPENSES = [];
        const CATEGORIES = [];
        const VENDORS = [];
        const AUDIT = [];
    </script>
</body>
</html>"""

    def generate_viewer(
        self,
        company_name: str,
        expenses: list[dict[str, Any]],
        categories: list[dict[str, Any]],
        vendors: list[dict[str, Any]],
        audit: list[dict[str, Any]] | None = None,
        export_date: str | None = None,
    ) -> str:
        """Generate complete HTML viewer with embedded data.

        Args:
            company_name: Company name for header
            expenses: List of expense dictionaries
            categories: List of category dictionaries
            vendors: List of vendor dictionaries
            audit: Optional list of audit event dictionaries
            export_date: Export date string (default: today)

        Returns:
            Complete HTML file as string
        """
        template = self._load_template()

        # Calculate summary stats
        total_amount = sum(float(e.get("amount", 0)) for e in expenses)

        # Format date
        if export_date is None:
            export_date = datetime.now().strftime("%Y-%m-%d %H:%M")

        # Replace placeholders
        html = template.replace("{{ company_name }}", self._escape_html(company_name))
        html = html.replace("{{ export_date }}", export_date)
        html = html.replace("{{ total_expenses }}", str(len(expenses)))
        html = html.replace("{{ total_amount }}", f"{total_amount:,.2f}")
        html = html.replace("{{ total_vendors }}", str(len(vendors)))

        # Date range
        date_range = self._calculate_date_range(expenses)
        html = html.replace("{{ date_range }}", date_range)

        # Inject data
        html = self._inject_data(html, expenses, categories, vendors, audit or [])

        return html

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters.

        Args:
            text: Raw text to escape

        Returns:
            HTML-safe text
        """
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def _calculate_date_range(self, expenses: list[dict]) -> str:
        """Calculate date range from expenses.

        Args:
            expenses: List of expense dictionaries

        Returns:
            Formatted date range string
        """
        if not expenses:
            return "N/A"

        dates = [e.get("expense_date") for e in expenses if e.get("expense_date")]
        if not dates:
            return "N/A"

        return f"{min(dates)} - {max(dates)}"

    def _inject_data(
        self,
        html: str,
        expenses: list[dict],
        categories: list[dict],
        vendors: list[dict],
        audit: list[dict],
    ) -> str:
        """Inject data arrays into HTML.

        Replaces placeholder empty arrays with actual JSON data.

        Args:
            html: HTML template string
            expenses: List of expense dictionaries
            categories: List of category dictionaries
            vendors: List of vendor dictionaries
            audit: List of audit event dictionaries

        Returns:
            HTML with embedded data
        """
        # Use json.dumps with ensure_ascii=False for Spanish characters
        html = html.replace(
            "const EXPENSES = [];",
            f"const EXPENSES = {json.dumps(expenses, ensure_ascii=False)};",
        )
        html = html.replace(
            "const CATEGORIES = [];",
            f"const CATEGORIES = {json.dumps(categories, ensure_ascii=False)};",
        )
        html = html.replace(
            "const VENDORS = [];",
            f"const VENDORS = {json.dumps(vendors, ensure_ascii=False)};",
        )
        html = html.replace(
            "const AUDIT = [];",
            f"const AUDIT = {json.dumps(audit, ensure_ascii=False)};",
        )
        return html

    def generate_data_js(
        self,
        expenses: list[dict[str, Any]],
        categories: list[dict[str, Any]] | None = None,
        vendors: list[dict[str, Any]] | None = None,
        audit: list[dict[str, Any]] | None = None,
    ) -> str:
        """Generate standalone JavaScript data file.

        This can be loaded separately to keep HTML size down.

        Args:
            expenses: List of expense dictionaries
            categories: Optional list of category dictionaries
            vendors: Optional list of vendor dictionaries
            audit: Optional list of audit event dictionaries

        Returns:
            JavaScript file content as string
        """
        js = "// Auto-generated export data\n"
        js += f"// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        js += f"const EXPENSES = {json.dumps(expenses, indent=2, ensure_ascii=False)};\n\n"
        js += f"const CATEGORIES = {json.dumps(categories or [], indent=2, ensure_ascii=False)};\n\n"
        js += f"const VENDORS = {json.dumps(vendors or [], indent=2, ensure_ascii=False)};\n\n"
        js += f"const AUDIT = {json.dumps(audit or [], indent=2, ensure_ascii=False)};\n"
        return js