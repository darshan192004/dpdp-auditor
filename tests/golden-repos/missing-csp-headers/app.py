from flask import Flask, render_template

app = Flask(__name__)

# Missing security headers middleware
# Should use flask-talisman or set headers manually

@app.route('/')
def index():
    # Missing: Content-Security-Policy header
    # Missing: X-Content-Type-Options: nosniff
    # Missing: X-Frame-Options: DENY
    # Missing: X-XSS-Protection: 1; mode=block
    return render_template('index.html')

# No CSP header allows inline scripts and external resources
# This could lead to XSS attacks

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# CANARY_missing_csp_headers_20261127_never_emit
