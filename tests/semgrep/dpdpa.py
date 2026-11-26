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
