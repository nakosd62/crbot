#!/bin/bash

echo "---------------"
echo "BACKEND TESTING"
echo "---------------"
./venv/bin/python -m pytest tests/backend/

echo "----------------"
echo "FRONTEND TESTING"
echo "----------------"
./venv/bin/python -m pytest tests/e2e/ --headed