# Golden fixture: dpdpa.python.pii-in-logs must report DPDPA-8.4-LOG-01.
import logging

logger = logging.getLogger(__name__)


def log_user(user):
    logger.info("user email: %s", user.email)
