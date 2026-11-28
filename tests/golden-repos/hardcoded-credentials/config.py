import os
# from dotenv import load_dotenv  # Not using dotenv

# Hardcoded credentials - CRITICAL finding
DATABASE_CONFIG = {
    'host': 'prod-db.internal.example.com',
    'port': 5432,
    'user': 'app_user',
    'password': 'SuperSecret123!',  # Leaked password
    'database': 'customer_data',
}

# Hardcoded API key - CRITICAL finding
GITHUB_API_TOKEN = 'ghp_TEST_PLACEHOLDER_DO_NOT_USE'
STRIPE_SECRET_KEY = 'sk_test_PLACEHOLDER_DO_NOT_USE'

# Configuration that should use environment variables
def get_db_connection():
    conn = create_connection(
        host=DATABASE_CONFIG['host'],
        user=DATABASE_CONFIG['user'],
        password=DATABASE_CONFIG['password']  # Using hardcoded password
    )
    return conn

# CANARY_hardcoded_credentials_20261127_never_emit
