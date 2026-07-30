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
./venv/bin/python -m pytest tests/e2e/ $1  ##(use --headed if needed)
./kill_app.sh