def persist_with_basis(email):
    # lawful_basis: consent
    # ok: dpdpa.generic.lawful-basis-missing
    db.save(email)


def persist_without_basis(email):
    # ruleid: dpdpa.generic.lawful-basis-missing
    db.save(email)


def persist_with_basis_after(email):
    # ok: dpdpa.generic.lawful-basis-missing
    db.save(email)
    record(legal_basis)


try:
    process()
# ok: dpdpa.generic.breach-alert-missing
except ValueError:
    notify()
# ruleid: dpdpa.generic.breach-alert-missing
except RuntimeError:
    recover()


try:
    risky()
# ruleid: dpdpa.generic.breach-alert-missing
except TypeError:
    logger.error("report failed")
    recover()


try:
    risky()
# ruleid: dpdpa.generic.breach-alert-missing
except KeyError:
    # alert(payload) is handled elsewhere
    recover()


try:
    risky()
# ruleid: dpdpa.generic.breach-alert-missing
except LookupError:
    logger.info("incident(open)")
    recover()


try:
    risky()
# ok: dpdpa.generic.breach-alert-missing
except ValueError:
    step01 = 1
    step02 = 2
    step03 = 3
    step04 = 4
    step05 = 5
    step06 = 6
    step07 = 7
    step08 = 8
    step09 = 9
    step10 = 10
    step11 = 11
    step12 = 12
    notify()


def two_handlers():
    try:
        risky()
    # ruleid: dpdpa.generic.breach-alert-missing
    except ValueError:
        recover()
    try:
        risky()
    # ok: dpdpa.generic.breach-alert-missing
    except TypeError:
        notify()
