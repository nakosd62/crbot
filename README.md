# CRBot: CockroachDB Web SQL Client & Gemini Assistant

CRBot is an interactive, high-fidelity web console and Gemini-powered assistant that translates natural language prompts into CockroachDB SQL queries and executes them. The application features a Python Flask backend and a dark-themed SQL console frontend with schema visualization, dynamic query execution, and detailed Gemini translation stats (tokens, latency, and cache hits).

---

## Features
- **Natural Language to SQL**: Translate query ideas into executable CockroachDB SQL statements using Gemini models.
- **Interactive SQL Console**: Execute arbitrary raw SQL commands against CockroachDB with dynamic table rendering.
- **Dynamic Database & User Detection**: Live connection status, database name, and username indicators on the dashboard.
- **Performance & Token Metrics**: Tracks response latency, input/output tokens, thinking tokens, and cached tokens for each translation.
- **Translation Logging**: Saves prompt and query history in the `translations` table inside your CockroachDB instance.

---

## Getting Started

### 1. Prerequisites
- **Python 3.9+**
- **CockroachDB** instance running locally or on CockroachDB Cloud.
- **Gemini API Key** (for Natural Language translation support).

### 2. Installation
Navigate to the project root directory, create a virtual environment, and install dependencies:
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Variables
CRBot uses the following environment variables for configuration:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | Connection string to CockroachDB | `postgresql://postgres:password@localhost:26257/defaultdb?sslmode=verify-full` |
| `GEMINI_API_KEY` | Your Google Gemini API Key | *None (Required for translation)* |
| `GEMINI_MODEL` | Gemini model to use for translations | `gemini-2.5-flash` |
| `CRBOT_HOSTNAME` | Host address Flask server binds to | `0.0.0.0` |
| `CRBOT_PORT` | Port number Flask server binds to | `3000` |

---

## Running the Application

### Option A: Using Helper Scripts (Recommended)
You can use the provided bash scripts to quickly spin up the app and expose it externally using ngrok.

1. **Launch the App**:
   ```bash
   ./launch_app.sh
   ```
   This script configures variables, terminates previous instances, runs the Flask app via `nohup` (logging to `app.log`), starts `ngrok` (logging to `ngrok.log`), and tails both logs.

2. **Stop the App**:
   ```bash
   ./kill_app.sh
   ```
   This terminates both the Flask server and the ngrok tunnel.

### Option B: Manual Execution
To run the server manually in the foreground:
```bash
export DATABASE_URL="postgresql://<username>:<password>@<host>:<port>/<database>"
export GEMINI_API_KEY="your-api-key"
./venv/bin/python3 app.py
```
Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

---

## Directory Layout
* `app.py`: Flask backend exposing `/api/translate`, `/api/execute`, and `/api/config`.
* `frontend/`: Static frontend files (`index.html`, `client.js`, `style.css`).
* `launch_app.sh` & `kill_app.sh`: Automated management scripts.
