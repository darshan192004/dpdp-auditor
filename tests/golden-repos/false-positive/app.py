# Golden fixture: dpdpa.python.no-consent-check reports DPDPA-6-CONSENT-01; the golden
# runner must honour a false_positive triage note that excludes it from the score.
def record_email(store, email):
    store.insert(0, {"email": email})
