document.addEventListener('DOMContentLoaded', () => {
  let chatHistory = [];

  // DEFAULT CONSTANTS
  const DEFAULT_DB_URL = window.DEFAULT_DB_URL || "";
  const DEFAULT_MODEL = "gemini-3.6-flash";
  const DEFAULT_API_KEY = (window.PRESET_KEYS && window.PRESET_KEYS[0]) || "";

  // Inputs & Primary Buttons
  const aiPrompt = document.getElementById('aiPrompt');
  const sqlQueryTextarea = document.getElementById('sqlQuery');
  const translateBtn = document.getElementById('translateBtn');
  const runBtn = document.getElementById('runBtn');
  const luckyBtn = document.getElementById('luckyBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // CodeMirror Initialization
  let sqlEditor = null;
  if (sqlQueryTextarea && window.CodeMirror) {
    sqlEditor = window.CodeMirror.fromTextArea(sqlQueryTextarea, {
      mode: 'text/x-sql',
      theme: 'dracula',
      lineNumbers: true,
      lineWrapping: true,
      viewportMargin: 10
    });
    sqlEditor.setSize('100%', '100%');
  }

  function getSqlQuery() {
    return sqlEditor ? sqlEditor.getValue().trim() : (sqlQueryTextarea ? sqlQueryTextarea.value.trim() : '');
  }

  function setSqlQuery(val) {
    if (sqlEditor) {
      sqlEditor.setValue(val);
      requestAnimationFrame(() => {
        sqlEditor.refresh();
      });
    } else if (sqlQueryTextarea) {
      sqlQueryTextarea.value = val;
    }
  }

  // Stats Display
  const transStatus = document.getElementById('transStatus');
  const transTime = document.getElementById('transTime');
  const tokensTotal = document.getElementById('tokensTotal');
  const execStatus = document.getElementById('execStatus');
  const execTime = document.getElementById('execTime');
  const execRows = document.getElementById('execRows');

  // Configuration Modal Elements
  const configModal = document.getElementById('configModal');
  const configBtn = document.getElementById('configBtn');
  const configCloseBtn = document.getElementById('modalCloseBtn');
  const configSaveBtn = document.getElementById('configSaveBtn');
  const configResetBtn = document.getElementById('configResetBtn');

  const modalDbUrl = document.getElementById('modalDbUrl');
  const modalCustomApiKey = document.getElementById('modalCustomApiKey');

  const resultsTabsNav = document.getElementById('resultsTabsNav');
  const resultsHeader = document.getElementById('resultsHeader');
  const resultsBody = document.getElementById('resultsBody');

  function loadConfig() {
    return {
      model: localStorage.getItem('crbot_model') || DEFAULT_MODEL,
      apiKey: localStorage.getItem('crbot_api_key') || DEFAULT_API_KEY,
      dbUrl: localStorage.getItem('crbot_db_url') || DEFAULT_DB_URL
    };
  }

  function saveConfig(model, apiKey, dbUrl) {
    if (model) localStorage.setItem('crbot_model', model);
    if (apiKey !== undefined) localStorage.setItem('crbot_api_key', apiKey);
    if (dbUrl !== undefined) localStorage.setItem('crbot_db_url', dbUrl);
  }

  function initializeApiKeyUI() {
    const group = document.getElementById('modalApiKeyGroup');
    if (!group) return;

    if (window.PRESET_KEYS && Array.isArray(window.PRESET_KEYS) && window.PRESET_KEYS.length > 0) {
      const customOption = Array.from(group.querySelectorAll('.radio-option'))
        .find(opt => opt.querySelector('input[value="custom"]'));

      // Remove existing preset options if any
      group.querySelectorAll('.radio-option').forEach(opt => {
        if (opt !== customOption) opt.remove();
      });

      // Dynamically prepend preset keys
      window.PRESET_KEYS.forEach(key => {
        let label = key;
        if (key.length > 12) {
          label = key.substring(0, 4) + "..." + key.substring(key.length - 5);
        }

        const option = document.createElement('label');
        option.className = 'radio-option';
        option.innerHTML = `
          <input type="radio" name="api_key_choice" value="${key}">
          <span class="radio-label">${label}</span>
        `;
        group.insertBefore(option, customOption);
      });
    }
  }

  function maskConnectionDbUrl(url) {
    if (!url) return "";
    const match = url.match(/^(postgresql:\/\/)([^:]+):([^@]+)(@.+)$/);
    if (match) {
      return `${match[1]}${match[2]}:****${match[4]}`;
    }
    return url;
  }

  function unmaskConnectionDbUrl(inputValue, originalValue) {
    if (!inputValue) return "";
    if (inputValue.includes("****")) {
      // First try to resolve using DEFAULT_DB_URL
      if (DEFAULT_DB_URL) {
        const defaultMatch = DEFAULT_DB_URL.match(/^(postgresql:\/\/[^:]+):([^@]+)(@.+)$/);
        if (defaultMatch) {
          return inputValue.replace("****", defaultMatch[2]);
        }
      }
      // Fallback to originalValue (current config in localStorage)
      if (originalValue) {
        const origMatch = originalValue.match(/^(postgresql:\/\/[^:]+):([^@]+)(@.+)$/);
        if (origMatch) {
          return inputValue.replace("****", origMatch[2]);
        }
      }
    }
    return inputValue;
  }

  function loadConfigIntoUI() {
    const config = loadConfig();
    const modelRadio = document.querySelector(`input[name="gemini_model"][value="${config.model}"]`);
    if (modelRadio) modelRadio.checked = true;

    if (modalDbUrl) modalDbUrl.value = maskConnectionDbUrl(config.dbUrl);

    const apiKeyRadio = document.querySelector(`input[name="api_key_choice"][value="${config.apiKey}"]`);
    if (apiKeyRadio) {
      apiKeyRadio.checked = true;
      if (modalCustomApiKey) modalCustomApiKey.classList.add('hidden');
    } else if (config.apiKey) {
      const customRadio = document.querySelector('input[name="api_key_choice"][value="custom"]');
      if (customRadio) customRadio.checked = true;
      if (modalCustomApiKey) {
        modalCustomApiKey.value = config.apiKey;
        modalCustomApiKey.classList.remove('hidden');
      }
    }
  }

  async function updateConnectionDetails() {
    const config = loadConfig();
    const connDbName = document.getElementById('connDbName');
    const connDbUser = document.getElementById('connDbUser');

    try {
      const response = await fetch(`/api/config?database_url=${encodeURIComponent(config.dbUrl)}`);
      const data = await response.json();

      if (data.database_name && data.username) {
        const dbName = data.database_name;
        const username = data.username;

        // Update DOM Spans
        if (connDbName) connDbName.textContent = dbName;
        if (connDbUser) connDbUser.textContent = username;

        // Update Browser Window / Tab Title
        document.title = `CRBot : Talk to your CockroachDB. You are currently connected to ${dbName} as ${username}`;
      }
    } catch (err) {
      console.error("Failed to fetch connection metadata:", err);
    }
  }

  // Initialize UI configuration and fetch dynamic connection details
  initializeApiKeyUI();
  loadConfigIntoUI();
  updateConnectionDetails();

  document.getElementById('modalApiKeyGroup')?.addEventListener('change', (e) => {
    if (e.target.name === 'api_key_choice' && modalCustomApiKey) {
      modalCustomApiKey.classList.toggle('hidden', e.target.value !== 'custom');
    }
  });

  function renderSqlErrorInResults(title, errorMessage, sqlQuery = '') {
    if (!resultsBody) return;
    if (resultsTabsNav) resultsTabsNav.classList.add('hidden');

    const sanitize = (str) => (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));

    let positionHint = '';
    const posMatch = errorMessage.match(/POSITION:\s*(\d+)/i) || errorMessage.match(/at or near "([^"]+)"/i);
    if (posMatch) {
      positionHint = `Parsing Hint: Failure detected ${posMatch[0]}`;
    }

    resultsHeader.innerHTML = '';
    resultsBody.innerHTML = `
      <tr>
        <td colspan="100%" class="error-cell">
          <div class="results-error-banner sql-parse-error">
            <div class="error-header">
              <span class="error-icon">❌</span>
              <strong>${sanitize(title)}</strong>
              ${positionHint ? `<span class="error-badge">${sanitize(positionHint)}</span>` : ''}
            </div>
            
            <div class="error-body">
              <div class="error-message">${sanitize(errorMessage)}</div>
              ${sqlQuery ? `
                <div class="error-sql-preview">
                  <span class="preview-label">Failed Query:</span>
                  <pre><code>${sanitize(sqlQuery)}</code></pre>
                </div>
              ` : ''}
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  async function translatePrompt() {
    const promptText = aiPrompt ? aiPrompt.value.trim() : '';
    if (!promptText) return null;

    const config = loadConfig();

    if (transStatus) {
      transStatus.textContent = 'Translating...';
      transStatus.className = 'stat-val status-working';
    }

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          gemini_model: config.model,
          api_key: config.apiKey,
          database_url: config.dbUrl,
          history: chatHistory
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success && data.sql) {
        chatHistory.push({ role: 'user', text: promptText });
        chatHistory.push({ role: 'model', text: data.sql });

        const MAX_TURNS = 5;
        if (chatHistory.length > MAX_TURNS * 2) {
          chatHistory = chatHistory.slice(-MAX_TURNS * 2);
        }

        let formattedSQL = data.sql;
        if (window.sqlFormatter) {
          try {
            formattedSQL = window.sqlFormatter.format(data.sql, {
              language: 'postgresql',
              keywordCase: 'upper',
              tabWidth: 2
            });
          } catch (e) {
            console.warn('SQL formatting failed, displaying raw SQL', e);
          }
        }

        setSqlQuery(formattedSQL);

        if (transStatus) {
          transStatus.textContent = 'Success';
          transStatus.className = 'stat-val status-success';
        }
        if (transTime) transTime.textContent = `${data.duration || '--'} ms`;
        if (tokensTotal) tokensTotal.textContent = data.total_tokens || '--';

        return data.sql;
      } else {
        const geminiError = data.error || data.message || `HTTP ${response.status}: Gemini Translation Failed`;
        throw new Error(geminiError);
      }
    } catch (err) {
      if (transStatus) {
        transStatus.textContent = 'Error';
        transStatus.className = 'stat-val status-error';
      }
      renderSqlErrorInResults('Gemini Translation Error', err.message);
      return null;
    }
  }

  async function executeSQL(customSQL = null) {
    const queryText = customSQL || getSqlQuery();
    if (!queryText) return;

    const config = loadConfig();

    if (execStatus) {
      execStatus.textContent = 'Running...';
      execStatus.className = 'stat-val status-working';
    }

    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: queryText,
          database_url: config.dbUrl
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        if (execStatus) {
          execStatus.textContent = 'Success';
          execStatus.className = 'stat-val status-success';
        }
        if (execTime) execTime.textContent = `${data.executionTimeMs || '--'} ms`;
        if (execRows) execRows.textContent = data.rowCount ?? '--';

        renderResultsTabs(data.results || []);
      } else {
        const execError = data.error || data.message || `HTTP ${response.status}: Query Execution Failed`;
        throw new Error(execError);
      }
    } catch (err) {
      if (execStatus) {
        execStatus.textContent = 'Error';
        execStatus.className = 'stat-val status-error';
      }
      renderSqlErrorInResults('SQL Parse / Execution Error', err.message, queryText);
    }
  }

  function renderResultsTabs(resultSets) {
    if (!resultsTabsNav || !resultsHeader || !resultsBody) return;

    resultsTabsNav.innerHTML = '';
    resultsHeader.innerHTML = '';
    resultsBody.innerHTML = '';

    if (!resultSets || resultSets.length === 0) {
      resultsTabsNav.classList.add('hidden');
      resultsBody.innerHTML = '<tr><td class="no-data">No results returned.</td></tr>';
      return;
    }

    function displayResultSet(res) {
      resultsHeader.innerHTML = '';
      resultsBody.innerHTML = '';

      if (res.columns && res.columns.length > 0) {
        res.columns.forEach(col => {
          const th = document.createElement('th');
          th.textContent = col;
          resultsHeader.appendChild(th);
        });

        if (res.rows && res.rows.length > 0) {
          res.rows.forEach(row => {
            const tr = document.createElement('tr');
            res.columns.forEach(col => {
              const td = document.createElement('td');
              const val = row[col];

              if (val === null || val === undefined) {
                td.textContent = 'NULL';
                td.classList.add('cell-null');
              } else if (typeof val === 'object') {
                td.textContent = JSON.stringify(val, null, 2);
                td.classList.add('cell-multiline');
              } else {
                let stringVal = String(val);

                // Convert escaped literal '\n' sequences into actual newline characters
                if (stringVal.includes('\\n')) {
                  stringVal = stringVal.replace(/\\n/g, '\n');
                }

                td.textContent = stringVal;

                // Add multiline class if actual or converted newlines exist
                if (stringVal.includes('\n') || stringVal.includes('\r')) {
                  td.classList.add('cell-multiline');
                }
              }

              tr.appendChild(td);
            });
            resultsBody.appendChild(tr);
          });
        } else {
          resultsBody.innerHTML = `<tr><td colspan="${res.columns.length}" class="no-data">Statement executed successfully with no returned rows.</td></tr>`;
        }
      } else {
        resultsBody.innerHTML = `<tr><td class="no-data">${res.statement || 'Query executed successfully.'} (Affected rows: ${res.rowCount})</td></tr>`;
      }
    }

    if (resultSets.length > 1) {
      resultsTabsNav.classList.remove('hidden');

      resultSets.forEach((res, index) => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `result-tab-btn ${index === 0 ? 'active' : ''}`;
        if (res.statement) {
          tabBtn.title = res.statement;
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'result-tab-title';
        titleSpan.textContent = `Result ${index + 1}`;
        tabBtn.appendChild(titleSpan);

        if (res.rowCount !== undefined) {
          const badgeSpan = document.createElement('span');
          badgeSpan.className = 'result-tab-badge';
          badgeSpan.textContent = `(${res.rowCount})`;
          tabBtn.appendChild(badgeSpan);
        }

        const flareRight = document.createElement('span');
        flareRight.className = 'result-tab-flare-right';
        tabBtn.appendChild(flareRight);

        tabBtn.addEventListener('click', () => {
          document.querySelectorAll('.result-tab-btn').forEach(b => b.classList.remove('active'));
          tabBtn.classList.add('active');
          displayResultSet(res);
        });

        resultsTabsNav.appendChild(tabBtn);
      });
    } else {
      resultsTabsNav.classList.add('hidden');
    }

    displayResultSet(resultSets[0]);
  }

  if (translateBtn) translateBtn.addEventListener('click', () => translatePrompt());
  if (runBtn) runBtn.addEventListener('click', () => executeSQL());

  if (luckyBtn) {
    luckyBtn.addEventListener('click', async () => {
      try {
        const sql = await translatePrompt();
        if (sql) await executeSQL(sql);
      } catch (err) {
        renderSqlErrorInResults('Workflow Error', err.message);
      }
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      chatHistory = [];
      if (transStatus) {
        transStatus.textContent = 'History Cleared';
        transStatus.className = 'stat-val status-unknown';
      }
    });
  }

  if (aiPrompt) {
    aiPrompt.addEventListener('input', () => {
      setSqlQuery('');
      if (transStatus) {
        transStatus.textContent = 'Ready';
        transStatus.className = 'stat-val status-unknown';
      }
      if (transTime) transTime.textContent = '—';
      if (tokensTotal) tokensTotal.textContent = '—';

      if (execStatus) {
        execStatus.textContent = 'Ready';
        execStatus.className = 'stat-val status-unknown';
      }
      if (execTime) execTime.textContent = '—';
      if (execRows) execRows.textContent = '—';
    });
  }

  if (configBtn && configModal) {
    configBtn.addEventListener('click', () => {
      loadConfigIntoUI();
      configModal.classList.remove('hidden');
    });
  }

  const closeModal = () => {
    if (configModal) configModal.classList.add('hidden');
  };

  if (configCloseBtn) configCloseBtn.addEventListener('click', closeModal);

  if (configSaveBtn) {
    configSaveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedModel = document.querySelector('input[name="gemini_model"]:checked')?.value || DEFAULT_MODEL;
      const keyChoice = document.querySelector('input[name="api_key_choice"]:checked')?.value;
      
      let apiKey = keyChoice;
      if (keyChoice === 'custom' && modalCustomApiKey) {
        apiKey = modalCustomApiKey.value.trim();
      }

      const inputDbUrl = modalDbUrl ? modalDbUrl.value.trim() : '';
      const config = loadConfig();
      const dbUrl = unmaskConnectionDbUrl(inputDbUrl, config.dbUrl);

      saveConfig(selectedModel, apiKey, dbUrl);
      updateConnectionDetails();
      closeModal();
    });
  }

  if (configResetBtn) {
    configResetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // Revert Model UI
      const modelRadio = document.querySelector(`input[name="gemini_model"][value="${DEFAULT_MODEL}"]`);
      if (modelRadio) modelRadio.checked = true;

      // Revert Database URL UI (with masking applied)
      if (modalDbUrl) {
        modalDbUrl.value = maskConnectionDbUrl(DEFAULT_DB_URL);
      }

      // Revert API Key Choice UI (checks preset radio or falls back to custom)
      const apiKeyRadio = document.querySelector(`input[name="api_key_choice"][value="${DEFAULT_API_KEY}"]`);
      if (apiKeyRadio) {
        apiKeyRadio.checked = true;
        if (modalCustomApiKey) modalCustomApiKey.classList.add('hidden');
      } else {
        const customRadio = document.querySelector('input[name="api_key_choice"][value="custom"]');
        if (customRadio) customRadio.checked = true;
        if (modalCustomApiKey) {
          modalCustomApiKey.value = DEFAULT_API_KEY;
          modalCustomApiKey.classList.remove('hidden');
        }
      }

      // Directly save defaults to localStorage, update connection status, and close popup
      saveConfig(DEFAULT_MODEL, DEFAULT_API_KEY, DEFAULT_DB_URL);
      updateConnectionDetails();
      closeModal();
    });
  }
});