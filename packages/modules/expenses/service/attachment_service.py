from typing import List

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense_attachment import ExpenseAttachment
from packages.modules.expenses.schemas.expense_attachment import ExpenseAttachmentCreate


def create_expense_attachment(db: Session, payload: ExpenseAttachmentCreate) -> ExpenseAttachment:
    attachment = ExpenseAttachment(
        expense_id=payload.expense_id,
        attachment_type=payload.attachment_type,
        filename=payload.filename,
        content_text=payload.content_text,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def list_expense_attachments(db: Session, expense_id: int) -> List[ExpenseAttachment]:
    return (
        db.query(ExpenseAttachment)
        .filter(ExpenseAttachment.expense_id == expense_id)
        .order_by(ExpenseAttachment.id)
        .all()
    )
