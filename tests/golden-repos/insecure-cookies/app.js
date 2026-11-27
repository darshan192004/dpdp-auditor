// @ts-expect-error -- CommonJS require in test fixture
/* global require */

const express = require('express'); // eslint-disable-line @typescript-eslint/no-require-imports

const app = express();

function generateSessionId() {
  return Math.random().toString(36).substring(2);
}

// Insecure: No Secure flag, no HttpOnly flag, no SameSite
app.set('trust proxy', 1);

app.post('/login', (req, res) => {
  // Insecure cookie configuration
  res.cookie('sessionId', generateSessionId(), {
    // Missing: secure: true
    // Missing: httpOnly: true
    // Missing: sameSite: 'strict'
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year (too long)
  });
  res.json({ success: true });
});

// Storing sensitive data in cookies
app.post('/set-preferences', (req, res) => {
  // Insecure: Storing PII in cookies

  res.cookie('userEmail', 'test@example.com');
  res.json({ success: true });
});

// CANARY_insecure_cookies_20261127_never_emit
