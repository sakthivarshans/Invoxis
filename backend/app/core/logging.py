import logging
import re

_SECRET = re.compile(r"(AIza[0-9A-Za-z_\-]{20,}|api[_-]?key=[^&\s]+)", re.I)


class RedactFilter(logging.Filter):
    """Best-effort redaction of API keys that might appear in exception text."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()          # format with the original (typed) args first
        except Exception:  # noqa: BLE001 - never let logging break the app
            return True
        record.msg, record.args = _SECRET.sub("[REDACTED]", message), ()
        return True


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=level.upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    for h in logging.getLogger().handlers:
        h.addFilter(RedactFilter())
