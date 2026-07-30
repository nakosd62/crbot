#!/bin/bash

echo "---------------"
echo "BACKEND TESTING"
echo "---------------"
./venv/bin/python -m pytest tests/backend/

echo "----------------"
echo "FRONTEND TESTING"
echo "----------------"
./launch_app.sh
sleep 5
./venv/bin/python -m pytest tests/e2e/ --headed
./kill_app.sh