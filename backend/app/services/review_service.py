"""Review workflow as an explicit state machine. Every transition is persisted + audited."""
from sqlalchemy.orm import Session

from app.core.errors import AppError, InvalidTransitionError
from app.db.models import Invoice, ReviewHistory
from app.services import audit_service

ALLOWED: dict[str, set[str]] = {
    "pending": {"in_review", "approved", "rejected", "returned_for_correction"},
    "in_review": {"approved", "rejected", "returned_for_correction"},
    "returned_for_correction": {"in_review", "rejected"},
    "approved": {"in_review"},   # re-open
    "rejected": {"in_review"},   # re-open
}
ACTION_TARGET = {
    "marked_in_review": "in_review", "approved": "approved", "rejected": "rejected",
    "returned_for_correction": "returned_for_correction",
}
COMMENT_REQUIRED = {"rejected", "returned_for_correction"}
REVIEWABLE_PROCESSING = {"completed", "needs_review"}


def apply_review(db: Session, inv: Invoice, action: str, comment: str | None, actor: str) -> ReviewHistory:
    comment = (comment or "").strip() or None
    prev = inv.review_status

    if inv.is_archived:
        raise InvalidTransitionError("Archived invoices cannot be reviewed.")
    if inv.processing_status not in REVIEWABLE_PROCESSING:
        raise InvalidTransitionError(
            f"Invoice is '{inv.processing_status}'; review actions require completed extraction.",
            code="invoice_not_reviewable")

    if action == "note_added":
        if not comment:
            raise AppError("A comment is required for a note.", code="comment_required", status_code=422)
        new = prev  # no status change
    else:
        new = ACTION_TARGET[action]
        if new not in ALLOWED.get(prev, set()):
            raise InvalidTransitionError(
                f"Cannot move review status from '{prev}' to '{new}'.",
                details={"from": prev, "to": new, "allowed": sorted(ALLOWED.get(prev, set()))})
        if new in COMMENT_REQUIRED and not comment:
            raise AppError(f"A comment is required to set status '{new}'.",
                           code="comment_required", status_code=422)

    rec = ReviewHistory(invoice_id=inv.id, action=action, previous_status=prev, new_status=new,
                        comment=comment, actor=actor)
    db.add(rec)
    if new != prev:
        inv.review_status = new
        inv.version += 1
    if action != "note_added":
        inv.assigned_reviewer = actor
    inv.reviews.insert(0, rec) if "reviews" in inv.__dict__ else None
    audit_service.record(
        db, action=f"INVOICE_{action.upper()}", category="review", actor=actor, invoice=inv,
        description=f"Review action '{action}' on invoice {inv.invoice_number or inv.id}: "
                    f"{prev} → {new}" + (f". Comment: {comment}" if comment else ""),
        details={"previous_status": prev, "new_status": new, "comment": comment})
    return rec
