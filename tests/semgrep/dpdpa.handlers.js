/* eslint-disable @typescript-eslint/no-unused-vars, no-undef */
/* global db, record, legal_basis, risky, notify, recover, window */

function persist(email) {
  const suffix = '}';
  // ok: dpdpa.generic.lawful-basis-missing
  db.save(email);
  record(legal_basis);
}

function persistWithoutMarker(email) {
  const suffix = '}';
  // ruleid: dpdpa.generic.lawful-basis-missing
  db.save(email);
  recover(email);
}

try {
  risky();
  // ok: dpdpa.generic.breach-alert-missing
} catch (err) {
  const suffix = '}';
  notify(err);
}

try {
  risky();
  // ruleid: dpdpa.generic.breach-alert-missing
} catch (err) {
  const suffix = '}';
  recover(err);
}

// ok: dpdpa.generic.breach-alert-missing
window.onerror = (err) => {
  notify(err);
};

// ruleid: dpdpa.generic.breach-alert-missing
window.onerror = (err) => {
  recover(err);
};

// ok: dpdpa.generic.breach-alert-missing
security_event(() => {
  notify();
});

// ruleid: dpdpa.generic.breach-alert-missing
security_event(() => {
  recover();
});
