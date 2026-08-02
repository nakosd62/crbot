document.addEventListener('DOMContentLoaded', async () => {
  let chatHistory = [];

  let DEFAULT_DB_URL = "";
  let DEFAULT_MODEL = "gemini-3.6-flash";

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

  // DOM Elements - History Modal & Tabs
  const historyModal = document.getElementById('historyModal');
  const historyBtn = document.getElementById('historyBtn');
  const historyModalCloseBtn = document.getElementById('historyModalCloseBtn');
  const historyTableHeader = document.getElementById('historyTableHeader');
  const historyTableBody = document.getElementById('historyTableBody');

  const tabBtnTranslations = document.getElementById('tabBtnTranslations');
  const tabBtnStatistics = document.getElementById('tabBtnStatistics');
  const historyTabTranslations = document.getElementById('historyTabTranslations');
  const historyTabStatistics = document.getElementById('historyTabStatistics');

  // DOM Elements - Results Table & Tabs
  const resultsTabsNav = document.getElementById('resultsTabsNav');
  const resultsHeader = document.getElementById('resultsHeader');
  const resultsBody = document.getElementById('resultsBody');

  // Chart.js Instances
  let chartCountInstance = null;
  let chartTotalTokensInstance = null;
  let chartInputTokensInstance = null;

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

  function updateHistoryTurnsSubtitle() {
    const clearMsgEl = document.getElementById('clearHistoryMsg');
    if (!clearMsgEl) return;

    const turns = Math.floor(chatHistory.length / 2);
    clearMsgEl.textContent = `${turns} turn${turns === 1 ? '' : 's'} in history (max 5)`;
    clearMsgEl.style.color = 'var(--text-muted, #94a3b8)';
  }

  async function fetchBackendConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();

      DEFAULT_DB_URL = data.default_database_url || "";
      DEFAULT_MODEL = data.default_model || "gemini-3.6-flash";

      if (!localStorage.getItem('crbot_model')) {
        localStorage.setItem('crbot_model', DEFAULT_MODEL);
      }
      // DB URL is session-scoped only; do not carry over from prior browser sessions.
      localStorage.removeItem('crbot_db_url');
      if (!sessionStorage.getItem('crbot_db_url') && DEFAULT_DB_URL) {
        sessionStorage.setItem('crbot_db_url', DEFAULT_DB_URL);
      }

      loadConfigIntoUI();
      await triggerConfigSave({ closeModal: false });
    } catch (err) {
      console.error("Failed to fetch backend configuration:", err);
    }
  }

  function loadConfig() {
    return {
      model: localStorage.getItem('crbot_model') || DEFAULT_MODEL,
      dbUrl: sessionStorage.getItem('crbot_db_url') || DEFAULT_DB_URL
    };
  }

  function saveConfig(model, dbUrl) {
    if (model) localStorage.setItem('crbot_model', model);
    if (dbUrl !== undefined) sessionStorage.setItem('crbot_db_url', dbUrl);
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

    const modelRadios = document.querySelectorAll('input[name="gemini_model"]');
    modelRadios.forEach(r => r.checked = false);

    let matchingModelRadio = document.querySelector(`input[name="gemini_model"][value="${config.model}"]`);
    if (matchingModelRadio) {
      matchingModelRadio.checked = true;
    } else if (modelRadios.length > 0) {
      modelRadios[modelRadios.length - 1].checked = true;
    }

    const modalDbUrl = document.getElementById('modalDbUrl');
    if (modalDbUrl) {
      modalDbUrl.value = maskConnectionDbUrl(config.dbUrl);
    }

    updateHistoryTurnsSubtitle();
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

  async function triggerConfigSave(options = { closeModal: true }) {
    const selectedModel = document.querySelector('input[name="gemini_model"]:checked')?.value || DEFAULT_MODEL;

    const modalDbUrlInput = document.getElementById('modalDbUrl')?.value.trim() || "";
    const currentConfig = loadConfig();
    const unmaskedDbUrl = unmaskConnectionDbUrl(modalDbUrlInput, currentConfig.dbUrl);

    saveConfig(selectedModel, unmaskedDbUrl);

    if (options.closeModal && configModal) {
      configModal.classList.add('hidden');
    }

    await updateConnectionDetails();
  }

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

  if (tabBtnTranslations && tabBtnStatistics) {
    tabBtnTranslations.addEventListener('click', () => {
      tabBtnTranslations.classList.add('active');
      tabBtnStatistics.classList.remove('active');
      if (historyTabTranslations) historyTabTranslations.classList.remove('hidden');
      if (historyTabStatistics) historyTabStatistics.classList.add('hidden');
    });

    tabBtnStatistics.addEventListener('click', () => {
      tabBtnStatistics.classList.add('active');
      tabBtnTranslations.classList.remove('active');
      if (historyTabStatistics) historyTabStatistics.classList.remove('hidden');
      if (historyTabTranslations) historyTabTranslations.classList.add('hidden');
    });
  }

  function renderStatisticsCharts(statsData) {
    if (!statsData || statsData.length === 0 || typeof window.Chart === 'undefined') return;

    const dates = statsData.map(item => item.day_date || item.date || 'Unknown');
    const totalTranslations = statsData.map(item => item.total_translations || 0);
    const sumTotalTokens = statsData.map(item => item.sum_total_tokens || 0);
    const sumInputTokens = statsData.map(item => item.sum_input_tokens || 0);

    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { 
        legend: { 
          display: false // Hides the legend for all charts
        } 
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    };

    // Chart 1: Total Translations per Day
    const ctxCount = document.getElementById('chartTranslationsPerDay')?.getContext('2d');
    if (ctxCount) {
      if (chartCountInstance) chartCountInstance.destroy();
      chartCountInstance = new window.Chart(ctxCount, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: 'Total Translations',
            data: totalTranslations,
            backgroundColor: 'rgba(56, 189, 248, 0.6)',
            borderColor: '#38bdf8',
            borderWidth: 1
          }]
        },
        options: commonOptions
      });
    }

    // Chart 2: Total Tokens per Day
    const ctxTotalTokens = document.getElementById('chartTotalTokensPerDay')?.getContext('2d');
    if (ctxTotalTokens) {
      if (chartTotalTokensInstance) chartTotalTokensInstance.destroy();
      chartTotalTokensInstance = new window.Chart(ctxTotalTokens, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: 'Sum of Total Tokens',
            data: sumTotalTokens,
            backgroundColor: 'rgba(16, 185, 129, 0.6)',
            borderColor: '#10b981',
            borderWidth: 1
          }]
        },
        options: commonOptions
      });
    }

    // Chart 3: Input Tokens per Day
    const ctxInputTokens = document.getElementById('chartInputTokensPerDay')?.getContext('2d');
    if (ctxInputTokens) {
      if (chartInputTokensInstance) chartInputTokensInstance.destroy();
      chartInputTokensInstance = new window.Chart(ctxInputTokens, {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: 'Sum of Input Tokens',
            data: sumInputTokens,
            backgroundColor: 'rgba(168, 85, 247, 0.6)',
            borderColor: '#a855f7',
            borderWidth: 1
          }]
        },
        options: commonOptions
      });
    }
  }

  async function loadHistoryData() {
    if (!historyTableHeader || !historyTableBody) return;

    historyTableHeader.innerHTML = '';
    historyTableBody.innerHTML = '<tr><td class="text-center text-muted py-8">Loading history...</td></tr>';

    try {
      const response = await fetch('/api/history');
      const data = await response.json();

      if (response.ok && data.success) {
        if (data.history && data.history.length > 0) {
          const rows = data.history;
          const columns = Object.keys(rows[0]);

          columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            historyTableHeader.appendChild(th);
          });

          historyTableBody.innerHTML = '';
          rows.forEach(row => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
              const td = document.createElement('td');
              const val = row[col];
              td.textContent = val !== null && val !== undefined ? val : 'NULL';
              td.classList.add('cell-multiline');
              if (val === null || val === undefined) td.classList.add('text-null');
              tr.appendChild(td);
            });
            historyTableBody.appendChild(tr);
          });
        } else {
          historyTableBody.innerHTML = '<tr><td class="text-center text-muted py-8">No history records found.</td></tr>';
        }

        renderStatisticsCharts(data.stats || []);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
      historyTableBody.innerHTML = `
        <tr>
          <td class="error-cell">
            <div class="error-container">
              <span class="error-icon">⚠️</span>
              <div class="error-details">
                <strong>Error Loading History</strong>
                <p>${err.message || "Failed to reach the backend service."}</p>
              </div>
            </div>
          </td>
        </tr>`;
    }
  }

  if (historyBtn && historyModal) {
    historyBtn.addEventListener('click', () => {
      historyModal.classList.remove('hidden');
      loadHistoryData();
    });
  }

  if (historyModalCloseBtn && historyModal) {
    historyModalCloseBtn.addEventListener('click', () => {
      historyModal.classList.add('hidden');
    });
  }

  if (configSaveBtn) {
    configSaveBtn.addEventListener('click', async () => {
      await triggerConfigSave({ closeModal: true });
    });
  }

  if (configResetBtn) {
    configResetBtn.addEventListener('click', async () => {
      localStorage.removeItem('crbot_model');
      sessionStorage.removeItem('crbot_db_url');

      loadConfigIntoUI();
      await triggerConfigSave({ closeModal: false });
    });
  }

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
        setSqlQuery('');

        if (transStatus) {
          transStatus.textContent = "Error";
          transStatus.className = "stat-val status-error";
        }
        if (transTime) transTime.textContent = "—";
        if (tokensTotal) tokensTotal.textContent = "—";

        if (execStatus) {
          execStatus.textContent = "Ready";
          execStatus.className = "stat-val";
        }
        if (execTime) execTime.textContent = "—";
        if (execRows) execRows.textContent = "—";

        console.error("Translation Error:", data.error || "Unknown error");

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
      setSqlQuery('');

      if (transStatus) {
        transStatus.textContent = "Error";
        transStatus.className = "stat-val status-error";
      }
      if (transTime) transTime.textContent = "—";
      if (tokensTotal) tokensTotal.textContent = "—";

      if (execStatus) {
        execStatus.textContent = "Ready";
        execStatus.className = "stat-val";
      }
      if (execTime) execTime.textContent = "—";
      if (execRows) execRows.textContent = "—";

      console.error("Failed to translate prompt:", err);

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
          chatHistory = chatHistory.slice(-10);
          updateHistoryTurnsSubtitle();
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

  if (aiPrompt) {
    aiPrompt.addEventListener('input', () => {
      setSqlQuery('');

      if (transStatus) {
        transStatus.textContent = "Ready";
        transStatus.className = "stat-val";
      }
      if (transTime) transTime.textContent = "—";
      if (tokensTotal) tokensTotal.textContent = "—";

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
      try {
        chatHistory = [];
        setSqlQuery('');
        if (aiPrompt) aiPrompt.value = '';
        if (transStatus) transStatus.textContent = "Ready";
        if (execStatus) execStatus.textContent = "Ready";
        if (resultsHeader) resultsHeader.innerHTML = '';
        if (resultsBody) resultsBody.innerHTML = '<tr><td class="text-center text-muted py-8">The answer will be displayed here.</td></tr>';
        if (resultsTabsNav) resultsTabsNav.classList.add('hidden');

        updateHistoryTurnsSubtitle();
      } catch (err) {
        console.error("Failed to clear chat history:", err);
        const clearMsgEl = document.getElementById('clearHistoryMsg');
        if (clearMsgEl) {
          clearMsgEl.textContent = 'Failed to clear chat history';
          clearMsgEl.style.color = 'var(--danger, #f87171)';
        }
      }
    });
  }

  await fetchBackendConfig();

  if (aiPrompt) aiPrompt.focus();
});