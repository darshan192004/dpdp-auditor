// @ts-expect-error -- CommonJS require in test fixture
/* global require */

const express = require('express'); // eslint-disable-line @typescript-eslint/no-require-imports
const session = require('express-session'); // eslint-disable-line @typescript-eslint/no-require-imports

const app = express();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function generateSessionId() {
  return Math.random().toString(36).substring(2);
}

// Missing secure cookie configuration
// No session timeout
// No session rotation
app.use(
  session({
    secret: 'mysecret', // Hardcoded secret
    resave: true,
    saveUninitialized: true,
    // Missing: cookie.secure = true
    // Missing: cookie.httpOnly = true
    // Missing: cookie.maxAge (session timeout)
  }),
);

// No session invalidation on logout
app.post('/logout', (req, res) => {
  // Missing: req.session.destroy()

  res.send('Logged out');
});

app.listen(3000);
