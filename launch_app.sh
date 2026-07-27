#!/bin/bash

export CRBOT_HOSTNAME="0.0.0.0"
export CRBOT_PORT="3000"

# 1. Setup Virtual Environment if missing
if [ ! -d "venv" ]; then
    echo "Virtual environment (venv) not found. Creating one..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "Error: Failed to create virtual environment. Make sure python3 is installed."
        exit 1
    fi
fi

# 2. Install/Update requirements
if [ -f "requirements.txt" ]; then
    echo "Installing/checking dependencies from requirements.txt..."
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "Error: Failed to install dependencies."
        exit 1
    fi
fi

# 3. Create a placeholder frontend/config.js if missing
if [ ! -f "frontend/config.js" ]; then
    echo "Creating default frontend/config.js..."
    cat << 'EOF' > frontend/config.js
// Local presets config - ignored by Git
window.PRESET_KEYS = [
  // Add your Gemini API keys here (e.g., "AIza...")
];

// Set your default CockroachDB connection string here
window.DEFAULT_DB_URL = "postgresql://postgres:password@localhost:26257/defaultdb?sslmode=verify-full";
EOF
    echo "Created a template frontend/config.js. Please edit it to customize your presets."
fi

echo "Stopping any previous instances of the server..."
if command -v lsof &> /dev/null; then
    PID=$(lsof -t -i:$CRBOT_PORT)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID listening on port $CRBOT_PORT..."
        kill -9 $PID 2>/dev/null
    fi
fi
pkill -9 -f "app.py" 2>/dev/null
pkill -9 -f "ngrok http" 2>/dev/null
sleep 2

echo "Starting Flask server..."
nohup ./venv/bin/python3 app.py > app.log 2>&1 &
sleep 2

# 4. Handle ngrok dependency gracefully
if command -v ngrok &> /dev/null; then
    echo "Starting ngrok..."
    echo "nohup ngrok http 127.0.0.1:$CRBOT_PORT > ngrok.log 2>&1 &"
    nohup ngrok http 127.0.0.1:$CRBOT_PORT > ngrok.log 2>&1 &
else
    echo "Notice: ngrok command not found. Skipping ngrok tunnel."
    echo "The application is running locally at http://localhost:$CRBOT_PORT"
fi

echo "Monitoring standard output / error..."
tail -f app.log