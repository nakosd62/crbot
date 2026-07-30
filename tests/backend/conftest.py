import pytest
import os
from unittest.mock import patch

# Ensure test environment variables are set before importing the app
os.environ["DATABASE_URL"] = "postgresql://postgres:testpassword@localhost:23456/testdb?sslmode=disable"
os.environ["STATSDB_CONN_STRING"] = "postgresql://postgres:testpassword@localhost:23456/statsdb?sslmode=disable"
os.environ["GEMINI_MODEL"] = "gemini-2.5-flash"
os.environ["GEMINI_API_KEY"] = "test-env-api-key"

from app import app

@pytest.fixture
def client():
    """Provides a Flask test client with testing mode enabled."""
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client