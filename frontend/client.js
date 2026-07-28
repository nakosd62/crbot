document.addEventListener('DOMContentLoaded', async () => {
  let chatHistory = [];

  let DEFAULT_DB_URL = "";
  let DEFAULT_MODEL = "gemini-3.6-flash";
  let DEFAULT_API_KEY = "";
  let PRESET_KEYS = [];

  // DOM Elements - Primary Controls
  const aiPrompt = document.getElementById('aiPrompt');
  const sqlQueryTextarea = document.getElementById('sqlQuery');
  const translateBtn = document.getElementById('translateBtn');
  const runBtn = document.getElementById('runBtn');
  const luckyBtn = document.getElementById('luckyBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // DOM Elements - Status & Stats
  const transStatus = document.getElementById('transStatus');
  const transTime = document.getElementById('transTime');
  const tokensTotal = document.getElementById('tokensTotal');
  const execStatus = document.getElementById('execStatus');
  const execTime = document.getElementById('execTime');
  const execRows = document.getElementById('execRows');

  // DOM Elements - Config Modal & Connection Status
  const configModal = document.getElementById('configModal');
  const configBtn = document.getElementById('configBtn');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const configSaveBtn = document.getElementById('configSaveBtn');
  const configResetBtn = document.getElementById('configResetBtn');
  const connDbName = document.getElementById('connDbName');
  const connDbUser = document.getElementById('connDbUser');

  // DOM Elements - Help Modal
  const helpModal = document.getElementById('helpModal');
  const helpBtn = document.getElementById('helpBtn');
  const helpModalCloseBtn = document.getElementById('helpModalCloseBtn');

  // DOM Elements - Results Table & Tabs
  const resultsTabsNav = document.getElementById('resultsTabsNav');
  const resultsHeader = document.getElementById('resultsHeader');
  const resultsBody = document.getElementById('resultsBody');

  // CodeMirror Setup
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

  async function fetchBackendConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();

      DEFAULT_DB_URL = data.default_database_url || "";
      DEFAULT_MODEL = data.default_model || "gemini-3.6-flash";
      PRESET_KEYS = data.preset_keys || [];
      DEFAULT_API_KEY = PRESET_KEYS[0] || "";

      initializeApiKeyUI();

      // Save defaults to localStorage if missing
      if (!localStorage.getItem('crbot_model')) {
        localStorage.setItem('crbot_model', DEFAULT_MODEL);
      }
      if (!localStorage.getItem('crbot_api_key') && DEFAULT_API_KEY) {
        localStorage.setItem('crbot_api_key', DEFAULT_API_KEY);
      }
      if (!localStorage.getItem('crbot_db_url') && DEFAULT_DB_URL) {
        localStorage.setItem('crbot_db_url', DEFAULT_DB_URL);
      }

      loadConfigIntoUI();

      // Trigger the standard save workflow on load to initialize state
      await triggerConfigSave({ closeModal: false });
    } catch (err) {
      console.error("Failed to fetch backend configuration:", err);
    }
  }

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

    if (PRESET_KEYS.length > 0) {
      const customOption = Array.from(group.querySelectorAll('.radio-option'))
        .find(opt => opt.querySelector('input[value="custom"]'));

      group.querySelectorAll('.radio-option').forEach(opt => {
        if (opt !== customOption) opt.remove();
      });

      PRESET_KEYS.forEach(key => {
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
      if (DEFAULT_DB_URL) {
        const defaultMatch = DEFAULT_DB_URL.match(/^(postgresql:\/\/[^:]+):([^@]+)(@.+)$/);
        if (defaultMatch) {
          return inputValue.replace("****", defaultMatch[2]);
        }
      }
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

    // 1. Model Radio Selection (Defaults to gemini-3.6-flash or the last radio option)
    const modelRadios = document.querySelectorAll('input[name="gemini_model"]');
    modelRadios.forEach(r => r.checked = false);

    let matchingModelRadio = document.querySelector(`input[name="gemini_model"][value="${config.model}"]`);
    if (matchingModelRadio) {
      matchingModelRadio.checked = true;
    } else if (modelRadios.length > 0) {
      modelRadios[modelRadios.length - 1].checked = true;
    }

    // 2. Set DB URL input
    const modalDbUrl = document.getElementById('modalDbUrl');
    if (modalDbUrl) {
      modalDbUrl.value = maskConnectionDbUrl(config.dbUrl);
    }

    // 3. API Key Selection
    const apiKeyRadios = document.querySelectorAll('input[name="api_key_choice"]');
    apiKeyRadios.forEach(r => r.checked = false);

    const apiKeyRadio = document.querySelector(`input[name="api_key_choice"][value="${config.apiKey}"]`);
    const modalCustomApiKey = document.getElementById('modalCustomApiKey');

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
    } else if (apiKeyRadios.length > 0) {
      apiKeyRadios[0].checked = true;
      if (modalCustomApiKey) modalCustomApiKey.classList.add('hidden');
    }
  }

  async function updateConnectionDetails() {
    const config = loadConfig();
    try {
      const response = await fetch(`/api/config?database_url=${encodeURIComponent(config.dbUrl)}`);
      const data = await response.json();

      if (data.database_name && data.username) {
        const dbName = data.database_name;
        const username = data.username;

        if (connDbName) connDbName.textContent = dbName;
        if (connDbUser) connDbUser.textContent = username;

        document.title = `CRBot : Talk to your CockroachDB. Connected to ${dbName} as ${username}`;
      }
    } catch (err) {
      console.error("Failed to fetch connection metadata:", err);
    }
  }

  // --- Reusable Save Helper ---
  async function triggerConfigSave(options = { closeModal: true }) {
    const selectedModel = document.querySelector('input[name="gemini_model"]:checked')?.value || DEFAULT_MODEL;
    const selectedApiKeyChoice = document.querySelector('input[name="api_key_choice"]:checked')?.value;
    const modalCustomApiKey = document.getElementById('modalCustomApiKey');
    
    let apiKey = DEFAULT_API_KEY;
    if (selectedApiKeyChoice === 'custom' && modalCustomApiKey) {
      apiKey = modalCustomApiKey.value.trim();
    } else if (selectedApiKeyChoice) {
      apiKey = selectedApiKeyChoice;
    }

    const modalDbUrlInput = document.getElementById('modalDbUrl')?.value.trim() || "";
    const currentConfig = loadConfig();
    const unmaskedDbUrl = unmaskConnectionDbUrl(modalDbUrlInput, currentConfig.dbUrl);

    // Save state
    saveConfig(selectedModel, apiKey, unmaskedDbUrl);

    // Conditionally hide modal
    if (options.closeModal && configModal) {
      configModal.classList.add('hidden');
    }

    // Refresh connection status / header title
    await updateConnectionDetails();
  }

  // --- Configuration Modal Listeners ---

  if (configBtn && configModal) {
    configBtn.addEventListener('click', () => {
      loadConfigIntoUI();
      configModal.classList.remove('hidden');
    });
  }

  if (modalCloseBtn && configModal) {
    modalCloseBtn.addEventListener('click', () => {
      configModal.classList.add('hidden');
    });
  }

  // --- Help Modal Listeners ---

  if (helpBtn && helpModal) {
    helpBtn.addEventListener('click', () => {
      helpModal.classList.remove('hidden');
    });
  }

  if (helpModalCloseBtn && helpModal) {
    helpModalCloseBtn.addEventListener('click', () => {
      helpModal.classList.add('hidden');
    });
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'api_key_choice') {
      const modalCustomApiKey = document.getElementById('modalCustomApiKey');
      if (modalCustomApiKey) {
        if (e.target.value === 'custom') {
          modalCustomApiKey.classList.remove('hidden');
        } else {
          modalCustomApiKey.classList.add('hidden');
        }
      }
    }
  });

  if (configSaveBtn) {
    configSaveBtn.addEventListener('click', async () => {
      await triggerConfigSave({ closeModal: true });
    });
  }

  // --- Reset Defaults Handler ---
  if (configResetBtn) {
    configResetBtn.addEventListener('click', async () => {
      // Clear storage
      localStorage.removeItem('crbot_model');
      localStorage.removeItem('crbot_api_key');
      localStorage.removeItem('crbot_db_url');

      // Sync UI inputs back to system defaults
      loadConfigIntoUI();

      // Save reset defaults into storage without dismissing modal
      await triggerConfigSave({ closeModal: false });
    });
  }

  // --- Table & Multi-Tab Rendering Helpers ---

  function renderTableResult(result) {
    if (!resultsHeader || !resultsBody) return;
    resultsHeader.innerHTML = '';
    resultsBody.innerHTML = '';

    if (!result || (!result.columns && !result.rows)) {
      resultsBody.innerHTML = `<tr><td class="text-center text-muted py-8">Statement executed successfully. No dataset returned.</td></tr>`;
      return;
    }

    if (result.columns && result.columns.length > 0) {
      result.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        resultsHeader.appendChild(th);
      });
    }

    if (result.rows && result.rows.length > 0) {
      result.rows.forEach(row => {
        const tr = document.createElement('tr');
        result.columns.forEach(col => {
          const td = document.createElement('td');
          const val = row[col];
          td.textContent = val !== null && val !== undefined ? val : 'NULL';
          
          // Add multiline formatting class so CSS white-space: pre-wrap takes effect
          td.classList.add('cell-multiline');
    
          if (val === null || val === undefined) td.classList.add('text-null');
          tr.appendChild(td);
        });
        resultsBody.appendChild(tr);
      });
    } else {
      resultsBody.innerHTML = `<tr><td colspan="${result.columns ? result.columns.length : 1}" class="text-center text-muted py-8">0 rows returned.</td></tr>`;
    }
  }

  function renderMultiTurnResults(results) {
    if (!resultsTabsNav) return;
    resultsTabsNav.innerHTML = '';

    if (!results || results.length === 0) {
      resultsTabsNav.classList.add('hidden');
      renderTableResult(null);
      return;
    }

    if (results.length === 1) {
      resultsTabsNav.classList.add('hidden');
      renderTableResult(results[0]);
      return;
    }

    resultsTabsNav.classList.remove('hidden');
    results.forEach((res, idx) => {
      const btn = document.createElement('button');
      btn.className = `result-tab-btn ${idx === 0 ? 'active' : ''}`;
      
      const sqlText = res.query || res.sql || res.statement || '';
      if (sqlText) {
        btn.setAttribute('title', sqlText);
      }

      const count = res.rowCount !== undefined ? res.rowCount : (res.rows ? res.rows.length : 0);
      btn.textContent = `Query ${idx + 1} (${count})`;

      btn.addEventListener('click', () => {
        document.querySelectorAll('.result-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTableResult(res);
      });
      resultsTabsNav.appendChild(btn);
    });

    renderTableResult(results[0]);
  }

  // --- Translation & Execution Logic ---
  async function translatePrompt() {
    const promptText = aiPrompt ? aiPrompt.value.trim() : "";
    if (!promptText) return;

    if (transStatus) {
      transStatus.textContent = "Working...";
      transStatus.className = "stat-val status-working";
    }

    const config = loadConfig();
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          history: chatHistory,
          gemini_model: config.model,
          api_key: config.apiKey,
          database_url: config.dbUrl
        })
      });

      const data = await response.json();
      if (response.ok && data.sql) {
        setSqlQuery(data.sql);

        if (transStatus) {
          transStatus.textContent = "Success";
          transStatus.className = "stat-val status-success";
        }
        if (transTime) transTime.textContent = `${data.duration} ms`;
        if (tokensTotal) tokensTotal.textContent = data.total_tokens || "—";
      } else {
        // 1. Empty SQL box
        setSqlQuery('');

        // 2. Translation Stats: "Error" + Dashes
        if (transStatus) {
          transStatus.textContent = "Error";
          transStatus.className = "stat-val status-error";
        }
        if (transTime) transTime.textContent = "—";
        if (tokensTotal) tokensTotal.textContent = "—";

        // 3. Execution Stats: "Ready" + Dashes
        if (execStatus) {
          execStatus.textContent = "Ready";
          execStatus.className = "stat-val";
        }
        if (execTime) execTime.textContent = "—";
        if (execRows) execRows.textContent = "—";

        console.error("Translation Error:", data.error || "Unknown error");

        // Display translation error in the results body & hide tabs
        if (resultsTabsNav) resultsTabsNav.classList.add('hidden');
        if (resultsHeader) resultsHeader.innerHTML = '';
        if (resultsBody) {
          resultsBody.innerHTML = `
            <tr>
              <td class="error-cell">
                <div class="error-container">
                  <span class="error-icon">⚠️</span>
                  <div class="error-details">
                    <strong>Translation Error</strong>
                    <p>${data.error || "An error occurred during translation."}</p>
                  </div>
                </div>
              </td>
            </tr>`;
        }
      }
    } catch (err) {
      // 1. Empty SQL box
      setSqlQuery('');

      // 2. Translation Stats: "Error" + Dashes
      if (transStatus) {
        transStatus.textContent = "Error";
        transStatus.className = "stat-val status-error";
      }
      if (transTime) transTime.textContent = "—";
      if (tokensTotal) tokensTotal.textContent = "—";

      // 3. Execution Stats: "Ready" + Dashes
      if (execStatus) {
        execStatus.textContent = "Ready";
        execStatus.className = "stat-val";
      }
      if (execTime) execTime.textContent = "—";
      if (execRows) execRows.textContent = "—";

      console.error("Failed to translate prompt:", err);

      // Display fetch/network translation error in the results body & hide tabs
      if (resultsTabsNav) resultsTabsNav.classList.add('hidden');
      if (resultsHeader) resultsHeader.innerHTML = '';
      if (resultsBody) {
        resultsBody.innerHTML = `
          <tr>
            <td class="error-cell">
              <div class="error-container">
                <span class="error-icon">⚠️</span>
                <div class="error-details">
                  <strong>Translation Network Error</strong>
                  <p>${err.message || "Failed to reach the translation backend server."}</p>
                </div>
              </div>
            </td>
          </tr>`;
      }
    }
  }

  async function executeSql() {
    const sql = getSqlQuery();
    if (!sql) return;

    if (execStatus) {
      execStatus.textContent = "Executing...";
      execStatus.className = "stat-val status-working";
    }

    const config = loadConfig();
    try {
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql: sql,
          database_url: config.dbUrl
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        if (execStatus) {
          execStatus.textContent = "Success";
          execStatus.className = "stat-val status-success";
        }
        if (execTime) execTime.textContent = `${data.executionTimeMs} ms`;
        if (execRows) execRows.textContent = data.rowCount;

        if (aiPrompt && aiPrompt.value.trim()) {
          chatHistory.push({
            role: 'user',
            text: aiPrompt.value.trim()
          });
          chatHistory.push({
            role: 'model',
            text: sql
          });
        }

        renderMultiTurnResults(data.results);
      } else {
        if (execStatus) {
          execStatus.textContent = "Error";
          execStatus.className = "stat-val status-error";
        }
        if (resultsBody) {
          resultsBody.innerHTML = `
            <tr>
              <td class="error-cell">
                <div class="error-container">
                  <span class="error-icon">⚠️</span>
                  <div class="error-details">
                    <strong>Execution Error</strong>
                    <p>${data.error || "An error occurred during SQL execution."}</p>
                  </div>
                </div>
              </td>
            </tr>`;
        }
      }
    } catch (err) {
      if (execStatus) {
        execStatus.textContent = "Error";
        execStatus.className = "stat-val status-error";
      }
      console.error("Failed to execute SQL:", err);
    }
  }

  // --- Button Event Bindings ---

  if (aiPrompt) {
    aiPrompt.addEventListener('input', () => {
      // 1. Empty SQL box
      setSqlQuery('');

      // 2. Translation Stats: "Ready" + Dashes
      if (transStatus) {
        transStatus.textContent = "Ready";
        transStatus.className = "stat-val";
      }
      if (transTime) transTime.textContent = "—";
      if (tokensTotal) tokensTotal.textContent = "—";

      // 3. Execution Stats: "Ready" + Dashes
      if (execStatus) {
        execStatus.textContent = "Ready";
        execStatus.className = "stat-val";
      }
      if (execTime) execTime.textContent = "—";
      if (execRows) execRows.textContent = "—";
    });
  }

  if (translateBtn) translateBtn.addEventListener('click', translatePrompt);
  if (runBtn) runBtn.addEventListener('click', executeSql);

  if (luckyBtn) {
    luckyBtn.addEventListener('click', async () => {
      await translatePrompt();
      await executeSql();
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      chatHistory = [];
      setSqlQuery('');
      if (aiPrompt) aiPrompt.value = '';
      if (transStatus) transStatus.textContent = "Ready";
      if (execStatus) execStatus.textContent = "Ready";
      if (resultsHeader) resultsHeader.innerHTML = '';
      if (resultsBody) resultsBody.innerHTML = '<tr><td class="text-center text-muted py-8">The answer will be displayed here.</td></tr>';
      if (resultsTabsNav) resultsTabsNav.classList.add('hidden');
    });
  }

  await fetchBackendConfig();

  // Focus the NL prompt box automatically after load
  if (aiPrompt) aiPrompt.focus();
  
});