"""Structured JSON logging.

Stdlib logging with a JSON formatter (code_style.md §13 allows the standard
logger). Every record carries `scanId` and `stage` when they are in scope, and
values whose key looks like a credential are replaced before serialisation so
a future careless `logger.info(..., extra={"hmac": secret})` cannot leak.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime
from typing import Any, Final

from pydantic import SecretStr

_SENSITIVE_KEY = re.compile(
    r"(secret|password|passwd|token|authorization|signature|hmac|api[_-]?key|credential)",
    re.IGNORECASE,
)
_REDACTED: Final = "<redacted>"

# LogRecord attributes that are part of the logging machinery, not user extras.
_RESERVED: Final[frozenset[str]] = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "message",
        "module",
        "msecs",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "taskName",
        "thread",
        "threadName",
    }
)


def _clean(key: str, value: Any) -> Any:
    if _SENSITIVE_KEY.search(key):
        return _REDACTED
    if isinstance(value, SecretStr):
        return _REDACTED
    if isinstance(value, BaseException):
        # Exception text can embed a URL or a token; keep the type only.
        return {"type": type(value).__name__}
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_clean(key, item) for item in value]
    if isinstance(value, dict):
        return {str(k): _clean(str(k), v) for k, v in value.items()}
    return str(value)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, with stable keys for log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(
                timespec="milliseconds"
            ),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_"):
                continue
            payload[key] = _clean(key, value)
        if record.exc_info is not None:
            exc_type = record.exc_info[0]
            payload["excType"] = exc_type.__name__ if exc_type is not None else "Exception"
        return json.dumps(payload, ensure_ascii=True, separators=(",", ":"), default=str)


def configure_logging(level: str = "info", *, scan_id: str | None = None) -> None:
    """Install the JSON formatter on the root logger exactly once."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())
    if scan_id is not None:
        logging.LoggerAdapter(logging.getLogger("scan_runner"), {"scanId": scan_id})
