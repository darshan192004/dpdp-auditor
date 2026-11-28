from flask import Flask, request, jsonify

app = Flask(__name__)

# Missing rate limiting on login endpoint
# Should use flask-limiter or similar
@app.route('/api/login', methods=['POST'])
def login():
    email = request.json.get('email')
    password = request.json.get('password')
    
    # No rate limiting - vulnerable to brute force
    user = authenticate(email, password)
    if user:
        return jsonify({'token': generate_token(user)})
    return jsonify({'error': 'Invalid credentials'}), 401

# Missing rate limiting on password reset
@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    email = request.json.get('email')
    # No rate limiting - vulnerable to enumeration
    send_reset_link(email)
    return jsonify({'status': 'sent'})

# Missing rate limiting on data export
@app.route('/api/export', methods=['POST'])
def export_data():
    # No rate limiting - vulnerable to data exfiltration
    data = get_all_data()
    return jsonify({'data': data})

# CANARY_missing_rate_limits_20261127_never_emit
