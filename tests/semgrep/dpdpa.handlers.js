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

try {
  risky();
  // ruleid: dpdpa.generic.breach-alert-missing
} catch (err) {
  logger.info('report(status)');
  recover(err);
}

try {
  risky();
  // ok: dpdpa.generic.breach-alert-missing
} catch (err) {
  step01 = 1;
  step02 = 2;
  step03 = 3;
  step04 = 4;
  step05 = 5;
  step06 = 6;
  step07 = 7;
  step08 = 8;
  step09 = 9;
  step10 = 10;
  step11 = 11;
  step12 = 12;
  notify(err);
}

function twoHandlers() {
  try {
    risky();
    // ruleid: dpdpa.generic.breach-alert-missing
  } catch (err) {
    recover(err);
  }
  try {
    risky();
    // ok: dpdpa.generic.breach-alert-missing
  } catch (err) {
    notify(err);
  }
}

// prettier-ignore
// ruleid: dpdpa.generic.breach-alert-missing
function longHeader() { try { const padding = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; risky(); } catch (err) { recover(err); } }

try {
  risky();
  // ok: dpdpa.generic.breach-alert-missing
} catch (err) {
  Notify(err);
}

// ok: dpdpa.generic.breach-alert-missing
window.onerror = notify;

// ok: dpdpa.generic.breach-alert-missing
security_event(notify);

// ok: dpdpa.generic.breach-alert-missing
const fakeHandler = 'catch (e) { notify() }';

// ok: dpdpa.generic.breach-alert-missing
// catch (e) { recover(err); }

function mixedIndent() {
  try {
    risky();
    // ok: dpdpa.generic.breach-alert-missing
  } catch (err) {
    notify(err);
  }
}

try {
  risky();
  // ok: dpdpa.generic.breach-alert-missing
} catch (err) {
  recover(err);

  notify(err);
}

function nestedHandler() {
  try {
    risky();
    // ruleid: dpdpa.generic.breach-alert-missing
  } catch (outer) {
    try {
      risky();
      // ok: dpdpa.generic.breach-alert-missing
    } catch (inner) {
      notify(inner);
    }
  }
}
