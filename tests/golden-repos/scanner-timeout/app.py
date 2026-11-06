# Golden fixture: gitleaks times out (coverage partial, grade null) while semgrep
# still reports dpdpa.python.pii-in-logs (rules.md section 14).
import logging

logger = logging.getLogger(__name__)


def log_order(order):
    logger.info("order for %s", order.email)
