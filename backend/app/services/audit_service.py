from typing import Any

from sqlalchemy.orm import Session

from app.db.models import AuditEvent, Invoice


def record(db: Session, *, action: str, category: str, description: str, actor: str,
           invoice: Invoice | None = None, invoice_id: str | None = None,
           invoice_number: str | None = None, details: dict[str, Any] | None = None) -> AuditEvent:
    """Append an audit event in the caller's transaction (so it commits/rolls back with the change)."""
    ev = AuditEvent(
        action=action, category=category, description=description, actor=actor,
        invoice_id=invoice.id if invoice else invoice_id,
        invoice_number=invoice.invoice_number if invoice else invoice_number,
        details=details,
    )
    db.add(ev)
    return ev
