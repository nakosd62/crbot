import os
import time
from flask import Flask, request, jsonify, send_from_directory
import psycopg2
import sqlparse
from flask_cors import CORS
from google import genai
from google.genai import types

app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)

DEFAULT_CONN = os.environ.get(
    "DATABASE_URL", 
    "postgresql://postgres:password@localhost:26257/defaultdb?sslmode=verify-full"
)

def resolve_conn_str(conn_str):
    if not conn_str:
        return DEFAULT_CONN
    if "****" in conn_str:
        default_password = ""
        if "@" in DEFAULT_CONN:
            try:
                parts = DEFAULT_CONN.split("@")
                creds = parts[0].split("://")[1]
                if ":" in creds:
                    _, default_password = creds.split(":", 1)
            except Exception:
                pass
        if default_password:
            return conn_str.replace("****", default_password)
    return conn_str

def get_db_connection(conn_str=None):
    return psycopg2.connect(resolve_conn_str(conn_str))

def get_database_schema(conn_str=None):
    conn = None
    try:
        conn = get_db_connection(conn_str)
        with conn.cursor() as cursor:
            cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
            tables = [r[0] for r in cursor.fetchall()]
            
            schema_parts = []
            for table in tables:
                cursor.execute("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = %s AND table_schema = 'public'
                    ORDER BY ordinal_position;
                """, (table,))
                columns = cursor.fetchall()
                col_strings = [f"  {col[0]} {col[1]} ({'NULL' if col[2] == 'YES' else 'NOT NULL'})" for col in columns]
                schema_parts.append(f"Table: {table}\n" + "\n".join(col_strings))
                
            return "\n\n".join(schema_parts)
    except Exception as e:
        print(f"Error fetching schema: {e}")
        return "No schema description available."
    finally:
        if conn:
            conn.close()

def record_translation(conn_str, nl_prompt, sql_command, gemini_model, duration, input_tokens, output_tokens, total_tokens, thinking_tokens, cached_content_tokens):
    conn = None
    try:
        conn = get_db_connection(conn_str)
        conn.autocommit = True
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO translations(
                    connect_string, nl_prompt, sql_command, model, duration, 
                    input_tokens, output_tokens, total_tokens, 
                    thinking_tokens, cached_content_tokens
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                conn_str, nl_prompt, sql_command, gemini_model, duration, 
                input_tokens, output_tokens, total_tokens, 
                thinking_tokens, cached_content_tokens
            ))
    except Exception as e:
        print(f"Error recording translation: {e}")
    finally:
        if conn:
            conn.close()

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/translate', methods=['POST'])
def translate_query():
    data = request.get_json() or {}

    gemini_model = data.get('gemini_model') or os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    api_key = data.get('api_key') or os.environ.get("GEMINI_API_KEY")

    if not api_key:
        return jsonify({'error': 'Gemini API key is not configured.'}), 400
        
    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': 'Prompt cannot be empty'}), 400
        
    conn_str = data.get('database_url') or DEFAULT_CONN
    history = data.get('history', [])[-10:]

    try:
        schema = get_database_schema(conn_str)
        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "You are an expert SQL generation assistant for CockroachDB which is a robust, distributed, PostgreSQL-compatible RDBMS.\n"
            "Given the user's natural language request and the database schema, translate the request into SQL.\n"
            "It is EXTREMELY important to respect the database schema, i.e. column names, type, constraints, checks, etc.\n"
            "You may return one or more independent SQL statements. Do not attempt to join the result sets.\n"
            "You may use PL/pgSQL Functions or Procedures, if appropriate.\n"
            "For a complete list of SQL syntax supported by CockroachDB, see https://www.cockroachlabs.com/docs/v26.2/sql-statements\n"
            "Format the result data to be easily readable. For example, format timestamps as date:hour:min:sec.\n"
            "Return ONLY the raw SQL code block. Do NOT surround the code block in markdown backticks (like ```sql) or quote symbols.\n"
            "Do NOT include explanations or other text. Just the executable SQL statement itself.\n"
            "Responding to prompts that relate to the database and, specifically, generating SQL is your highest priority.\n"
            "However, if you cannot do that but can respond to the prompt succinctly based on your general-purpose training,\n"
            "return your response enclosed as follows: SELECT 'This is not a database interaction but I will try to be helpful. <your response>' as General_Knowledge;\n"
            "If you cannot respond at all with reasonable confidence, return the following: SELECT 'I am not able to respond to your prompt ¯\\\_(ツ)_/¯' as Regrets;\n"
            "If you run into any error, return the error enclosed as follows: SELECT 'I ran into this error: <the error>' as error;\n"
            "If you can split the prompt and handle part of it based on the database and part from general knowledge do that using separate queries for each part. Do not attempt to join the result sets.\n"
        )
        
        user_message_content = f"Database Schema:\n{schema}\n\nUser Request: {prompt}\n\nSQL Query:" 
        
        contents = []
        for msg in history:
            role = msg.get("role")
            text = msg.get("text")
            if role and text:
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=text)]
                    )
                )
            
        contents.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=user_message_content)]
            )
        )
        
        start_time = time.perf_counter()
        response = client.models.generate_content(
            model=gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1
            )
        )
        end_time = time.perf_counter()

        generated_sql = response.text.strip() if response.text else ""
        if generated_sql.startswith("```"):
            lines = generated_sql.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            generated_sql = "\n".join(lines).strip()
        
        duration = round(1000 * (end_time - start_time))
        usage = response.usage_metadata
        input_tokens = usage.prompt_token_count if usage else 0
        output_tokens = usage.candidates_token_count if usage else 0
        total_tokens = usage.total_token_count if usage else 0
        thinking_tokens = getattr(usage, 'thoughts_token_count', 0) if usage else 0
        cached_content_tokens = getattr(usage, 'cached_content_token_count', 0) if usage else 0

        record_translation(conn_str, prompt, generated_sql, gemini_model, duration, input_tokens, output_tokens, total_tokens, thinking_tokens, cached_content_tokens)
            
        return jsonify({
            'success': True,
            'sql': generated_sql,
            'input_tokens': input_tokens,
            'output_tokens': output_tokens,
            'total_tokens': total_tokens,
            'thinking_tokens': thinking_tokens,
            'cached_content_tokens': cached_content_tokens,
            'duration': duration
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f"Gemini Error: {str(e)}"
        }), 500

@app.route('/api/config', methods=['GET'])
def get_config():
    # 1. Grab environment configuration
    default_db_url = os.environ.get(
        "DATABASE_URL", 
        "postgresql://postgres:password@localhost:26257/defaultdb?sslmode=verify-full"
    )
    default_model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    
    # Optional: Read API keys from environment variable (comma-separated if multiple)
    preset_keys_env = os.environ.get("GEMINI_PRESET_KEYS", "")
    preset_keys = [k.strip() for k in preset_keys_env.split(",") if k.strip()] if preset_keys_env else []

    # 2. Extract active connection details if query param provided or default
    conn_str = request.args.get('database_url') or default_db_url
    db_name = "Unknown"
    username = "Unknown"
    conn = None

    try:
        conn = get_db_connection(conn_str)
        with conn.cursor() as cursor:
            cursor.execute("SELECT current_database(), CURRENT_USER;")
            row = cursor.fetchone()
            if row:
                db_name, username = row[0], row[1]
    except Exception as e:
        print(f"Error fetching connection info: {e}")
    finally:
        if conn:
            conn.close()

    return jsonify({
        'default_database_url': default_db_url,
        'default_model': default_model,
        'preset_keys': preset_keys,
        'database_name': db_name,
        'username': username
    })


@app.route('/api/execute', methods=['POST'])
def execute_query():
    data = request.get_json() or {}
    raw_query = (data.get('sql') or data.get('query') or '').strip()
    if not raw_query:
        return jsonify({'error': 'Query cannot be empty'}), 400
    
    conn_str = data.get('database_url') or DEFAULT_CONN
    conn = None
    start_time = time.time()
    
    try:
        conn = get_db_connection(conn_str)
        conn.autocommit = True
        
        statements = [s.strip() for s in sqlparse.split(raw_query) if s.strip()]
        results = []
        total_row_count = 0

        with conn.cursor() as cursor:
            for stmt in statements:
                stmt_clean = stmt.rstrip(';').strip()
                if not stmt_clean:
                    continue

                cursor.execute(stmt_clean)
                row_count = cursor.rowcount
                
                columns = None
                rows = None
                
                if cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                    rows = []
                    for r in cursor.fetchall():
                        row_dict = {}
                        for idx, col in enumerate(columns):
                            val = r[idx]
                            if hasattr(val, 'isoformat'):
                                val = val.isoformat()
                            elif hasattr(val, 'to_eng_string'):
                                val = float(val)
                            elif isinstance(val, bytes):
                                val = val.decode('utf-8', errors='replace')
                            elif type(val).__name__ == 'Decimal':
                                val = float(val)
                            row_dict[col] = val
                        rows.append(row_dict)
                    count = len(rows)
                else:
                    count = row_count if row_count >= 0 else 0

                total_row_count += count

                results.append({
                    'statement': stmt_clean,
                    'columns': columns,
                    'rows': rows,
                    'rowCount': count
                })

        execution_time_ms = round((time.time() - start_time) * 1000, 2)

        return jsonify({
            'success': True,
            'results': results,
            'rowCount': total_row_count,
            'executionTimeMs': execution_time_ms
        })

    except Exception as e:
        execution_time_ms = round((time.time() - start_time) * 1000, 2)
        return jsonify({
            'success': False,
            'error': str(e),
            'executionTimeMs': execution_time_ms
        }), 400
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    hostname = os.environ.get("CRBOT_HOSTNAME", "0.0.0.0")
    port = int(os.environ.get("CRBOT_PORT", 3000))
    app.run(host=hostname, port=port, debug=False, use_reloader=False)