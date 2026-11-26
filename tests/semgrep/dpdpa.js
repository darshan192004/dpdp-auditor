/* global db, record, legal_basis, process, isSerious, notify, recover */

export function persistWithBasis(email) {
  // ok: dpdpa.generic.lawful-basis-missing
  db.save(email);
  record(legal_basis);
}

export function persistWithoutBasis(email) {
  // ruleid: dpdpa.generic.lawful-basis-missing
  db.save(email);
}

try {
  process();
  // ok: dpdpa.generic.breach-alert-missing
} catch (err) {
  if (isSerious(err)) {
    notify(err);
  }
}

try {
  notify();
  // ruleid: dpdpa.generic.breach-alert-missing
} catch (err) {
  recover(err);
}

export function persistWithCommentBasis(email) {
  // lawful_basis: consent
  // ok: dpdpa.generic.lawful-basis-missing
  db.save(email);
}

export function persistWithInlineBasis(email) {
  // ok: dpdpa.generic.lawful-basis-missing
  db.save(email, { lawful_basis: 'consent' });
}
