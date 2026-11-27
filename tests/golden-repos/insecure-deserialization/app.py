import pickle
import base64
from flask import Flask, request, jsonify

app = Flask(__name__)

# Insecure: pickle.loads with user input
@app.route('/api/preferences', methods=['POST'])
def save_preferences():
    encoded_data = request.json.get('data')
    # Insecure: Deserializing user-controlled input
    data = pickle.loads(base64.b64decode(encoded_data))
    
    # No validation of deserialized object
    user_preferences = process_preferences(data)
    save_preferences(user_preferences)
    return jsonify({'status': 'saved'})

# Insecure: eval() on user input
@app.route('/api/report', methods=['GET'])
def get_report():
    report_type = request.args.get('type')
    # Insecure: eval() is dangerous
    report_config = eval(report_type)
    return jsonify(generate_report(report_config))

# CANARY_insecure_deserialization_20261127_never_emit
