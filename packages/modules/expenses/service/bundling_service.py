"""Service to handle the automatic bundling of verified expenses into reports.
This is the ' la- la- l- l- la- de' muscle that takes validated docs and packages them.
"""

from __future__ import annotations
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from datetime import datetime

from packages.core.platform.models import Company
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.models.report import ExpenseReport
from packages.modules.expenses.schemas.report import ExpenseReportCreate
from packages.modules.expenses.service.report_service import create_report, add_expense_to_report

class BundlingService:
    @staticmethod
    def bundle_verified_expenses(db: Session, company_id: int, user_id: int, report_title: str) -> ExpenseReport:
        """
        Finds all expenses for the user that have passed all validation gates 
        (is_fully_verified = True) and bundles them into a new report.
        """
        # 1. Find all expenses for this user that are validated but not yet in a report
        verified_expenses = (
            db.query(Expense)
            .filter(
                Expense.company_id == company_id,
                Expense.user_id == user_id,
                Expense.status == "approved",
                Expense.report_id.is_(None),
                Expense.is_deleted == False,
            )
            .order_by(Expense.expense_date)
            .all()
        )

        if not verified_expenses:
            raise ValueError("No approved unbundled expenses found to bundle.")

        # 2. Create the report
        payload = ExpenseReportCreate(
            company_id=company_id,
            title=report_title,
            created_by=user_id
        )
        report = create_report(db, payload)

        # 3. Add expenses to the report
        for exp in verified_expenses:
            add_expense_to_report(db, exp.id, report.id)

        return report

    @staticmethod
    def get_bundle_manifest(db: Session, report_id: int) -> Dict[str, Any]:
        """
        Generates a manifest for the PDF reducer/packaging service.
        Lists every XML and PDF pair that belongs in this report.
        """
        from packages.modules.expenses.models.document import ExpenseDocument
        from packages.modules.expenses.models.expense import Expense

        expenses = db.query(Expense).filter(Expense.report_id == report_id).all()
        
        manifest_items = []
        total_count = 0

        total_count = len(expenses)
        for exp in expenses:
            # Find associated documents for this expense
            docs = db.query(ExpenseDocument).filter(ExpenseDocument.expense_id == exp.id).all()
            
            # Group by pairing
            pairs = []
            xmls = [d for d in docs if d.document_type == "cfdi_xml"]
            pdfs = [d for d in docs if d.document_type in ["cfdi_pdf", "pdf_unclassified", "ticket"]]
            
            # Simple 1:1 pairing for the manifest
            for i in range(max(len(xmls), len(pdfs))):
                pairs.append({
                    "xml_id": xmls[i].id if i < len(xmls) else None,
                    "pdf_id": pdfs[i].id if i < len(pdfs) else None,
                    "expense_id": exp.id
                })
            
            manifest_items.append({
                "expense_id": exp.id,
                "pairs": pairs
            })

        return {
            "report_id": report_id,
            "total_expenses": total_count,
            "manifest": manifest_items,
            "generated_at": datetime.utcnow().isoformat()
        }
