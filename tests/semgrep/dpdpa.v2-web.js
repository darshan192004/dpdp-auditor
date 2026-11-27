/* eslint-disable @typescript-eslint/no-unused-vars */
/* global setCookie, token */
// Positive fixture for custom DPDPA v2 Semgrep rules. Test input only.
// ruleid: dpdpa.v2.cmp.consent-mode-disabled
const cmpConfig = { enabled: false };
// ok: dpdpa.v2.cmp.consent-mode-disabled
const safeCmpConfig = { enabled: true };

// ruleid: dpdpa.v2.header.hsts-disabled
const helmetOptions = { hsts: false };
// ok: dpdpa.v2.header.hsts-disabled
const safeHelmetOptions = { hsts: true };

// ruleid: dpdpa.v2.cookie.missing-secure-flag
setCookie('session_id', token, { secure: false });
// ok: dpdpa.v2.cookie.missing-secure-flag
setCookie('session_id', token, { secure: true });
