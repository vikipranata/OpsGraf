

(function () {
  "use strict";

  
  const SERIES_COLORS = [
    "#0f556f", "#259dcc", "#059669", "#d97706", 
    "#dc2626", "#7c3aed", "#db2777", "#0891b2", 
    "#16a34a", "#475569", "#ca8a04", "#9333ea"
  ];

  const state = {
    dashboards: [],
    currentId: null,
    dashboardData: null,
    variables: {},
    timeRange: 900, 
    refreshInterval: 5, 
    refreshTimer: null,
    panels: new Map(), 
    syncCursor: null,
    timezone: "Asia/Jakarta",
    auth: {
      authenticated: false,
      username: ""
    }
  };

  const cursorSync = uPlot.sync("opsgraf-sync");

  
  const elSidebarNav = document.getElementById("sidebar-nav");
  const elDashboardTitle = document.getElementById("dashboard-title");
  const elDashboardDesc = document.getElementById("dashboard-desc");
  const elCrumb = document.getElementById("crumb-dashboard");
  const elVarToolbar = document.getElementById("var-toolbar");
  const elGrid = document.getElementById("dashboard-grid");
  const elEmpty = document.getElementById("empty-state");
  const elTimeSelect = document.getElementById("time-range-select");
  const elRefreshSelect = document.getElementById("refresh-interval-select");
  const elBtnRefresh = document.getElementById("btn-refresh");
  const elPromStatus = document.getElementById("prom-status");
  const elMetaStats = document.getElementById("meta-stats");
  const elTooltip = document.getElementById("uplot-tooltip");
  const elAlertBanner = document.getElementById("alert-banner");
  const elAlertTitle = document.getElementById("alert-title");
  const elAlertCopy = document.getElementById("alert-copy");
  const elAdminActions = document.getElementById("admin-actions");

  
  const elModalLogin = document.getElementById("modal-login");
  const elModalEdit = document.getElementById("modal-edit");
  const elModalBackups = document.getElementById("modal-backups");
  const elFormLogin = document.getElementById("form-login");
  const elLoginUsername = document.getElementById("login-username");
  const elLoginPassword = document.getElementById("login-password");
  const elLoginError = document.getElementById("login-error");
  const elLoginErrorMsg = document.getElementById("login-error-msg");
  const elBtnSubmitLogin = document.getElementById("btn-submit-login");
  const elEditJsonContent = document.getElementById("edit-json-content");
  const elEditError = document.getElementById("edit-error");
  const elEditErrorMsg = document.getElementById("edit-error-msg");
  const elBtnFormatJson = document.getElementById("btn-format-json");
  const elBtnSaveDashboard = document.getElementById("btn-save-dashboard");
  const elBackupsContainer = document.getElementById("backups-list-container");
  const elBackupsSubtitle = document.getElementById("backups-subtitle");

  function showAlert(title, copy) {
    elAlertBanner.style.display = "block";
    elAlertTitle.textContent = title;
    elAlertCopy.textContent = copy;
  }

  function hideAlert() {
    elAlertBanner.style.display = "none";
  }

  function formatTime(timestampSeconds) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: state.timezone || "Asia/Jakarta",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date(timestampSeconds * 1000));
    } catch (e) {
      return new Date(timestampSeconds * 1000).toLocaleTimeString();
    }
  }

  function formatDateTime(date) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: state.timezone || "Asia/Jakarta",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date(date));
    } catch (e) {
      return new Date(date).toLocaleString();
    }
  }

  function formatValue(val, unit) {
    if (val === null || val === undefined || isNaN(val)) return "-";
    const num = Number(val);
    if (!unit) {
      return Number.isInteger(num) ? num.toString() : num.toFixed(2);
    }
    unit = unit.toLowerCase();
    switch (unit) {
      case "percent":
      case "%":
        return num.toFixed(1) + "%";
      case "watt":
      case "w":
        if (num >= 1000) return (num / 1000).toFixed(2) + " kW";
        return num.toFixed(1) + " W";
      case "celsius":
      case "°c":
        return num.toFixed(1) + " °C";
      case "mvolt":
        if (Math.abs(num) >= 1000) return (num / 1000).toFixed(2) + " V";
        return num.toFixed(0) + " mV";
      case "ghz":
        if (num < 1) return (num * 1000).toFixed(0) + " MHz";
        return num.toFixed(2) + " GHz";
      case "gbytes":
        return num.toFixed(2) + " GB";
      case "bytes":
        if (num >= 1073741824) return (num / 1073741824).toFixed(2) + " GiB";
        if (num >= 1048576) return (num / 1048576).toFixed(2) + " MiB";
        if (num >= 1024) return (num / 1024).toFixed(2) + " KiB";
        return num.toFixed(0) + " B";
      case "rpm":
        return num.toFixed(0) + " RPM";
      default:
        return num.toFixed(2) + " " + unit;
    }
  }

  function interpolateQuery(expr) {
    if (!expr) return "";
    let res = expr;
    for (const [key, val] of Object.entries(state.variables)) {
      if (val !== undefined && val !== null) {
        const regex1 = new RegExp(`\\$${key}\\b`, "g");
        const regex2 = new RegExp(`\\$\\{${key}\\}`, "g");
        res = res.replace(regex1, val).replace(regex2, val);
      }
    }
    return res;
  }

  function renderLegendName(metric, template) {
    if (!metric) return "Value";
    if (!template) {
      if (metric.__name__) {
        const labels = Object.entries(metric)
          .filter(([k]) => k !== "__name__")
          .map(([k, v]) => `${k}="${v}"`)
          .join(", ");
        return labels ? `${metric.__name__}{${labels}}` : metric.__name__;
      }
      return metric.gpu_name || metric.instance || metric.sensor || metric.label || "Value";
    }
    const rendered = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => metric[key] || "").trim();
    if (rendered) return rendered;
    return metric.gpu_name || metric.instance || metric.sensor || metric.label || metric.__name__ || "Value";
  }

  
  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/status");
      if (res.ok) {
        const data = await res.json();
        state.auth = data;
      }
    } catch (e) {
      state.auth = { authenticated: false, username: "" };
    }
    renderAdminSection();
  }

  function renderAdminSection() {
    elAdminActions.innerHTML = "";
    if (state.auth.authenticated) {
      const badge = document.createElement("span");
      badge.className = "badge-admin";
      badge.textContent = `Admin: ${state.auth.username}`;

      const btnEdit = document.createElement("button");
      btnEdit.className = "btn btn--sm";
      btnEdit.type = "button";
      btnEdit.textContent = "Edit JSON";
      btnEdit.title = "Live edit dashboard JSON with automatic backup";
      btnEdit.addEventListener("click", openEditModal);

      const btnBackups = document.createElement("button");
      btnBackups.className = "btn btn--sm";
      btnBackups.type = "button";
      btnBackups.textContent = "History";
      btnBackups.title = "View versions & rollback";
      btnBackups.addEventListener("click", openBackupsModal);

      const btnLogout = document.createElement("button");
      btnLogout.className = "btn btn--sm";
      btnLogout.type = "button";
      btnLogout.textContent = "Logout";
      btnLogout.addEventListener("click", logout);

      elAdminActions.appendChild(badge);
      elAdminActions.appendChild(btnEdit);
      elAdminActions.appendChild(btnBackups);
      elAdminActions.appendChild(btnLogout);
    } else {
      const btnLogin = document.createElement("button");
      btnLogin.className = "btn btn--sm";
      btnLogin.type = "button";
      btnLogin.textContent = "Admin Login";
      btnLogin.title = "Login as administrator to edit dashboards";
      btnLogin.addEventListener("click", openLoginModal);
      elAdminActions.appendChild(btnLogin);
    }
  }

  function openLoginModal() {
    elLoginError.style.display = "none";
    elLoginUsername.value = "";
    elLoginPassword.value = "";
    elModalLogin.style.display = "flex";
    setTimeout(() => elLoginUsername.focus(), 100);
  }

  async function login() {
    elLoginError.style.display = "none";
    const username = elLoginUsername.value.trim();
    const password = elLoginPassword.value;
    if (!username || !password) return;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Invalid username or password");
      }
      const data = await res.json();
      state.auth = data;
      elModalLogin.style.display = "none";
      renderAdminSection();
    } catch (err) {
      elLoginError.style.display = "block";
      elLoginErrorMsg.textContent = err.message;
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    state.auth = { authenticated: false, username: "" };
    renderAdminSection();
  }

  
  function openEditModal() {
    if (!state.currentId || !state.dashboardData) return;
    elEditError.style.display = "none";
    document.getElementById("edit-modal-title").textContent = `Live Edit: ${state.currentId}.json`;
    elEditJsonContent.value = JSON.stringify(state.dashboardData, null, 2);
    elModalEdit.style.display = "flex";
  }

  function formatJsonEditor() {
    try {
      const parsed = JSON.parse(elEditJsonContent.value);
      elEditJsonContent.value = JSON.stringify(parsed, null, 2);
      elEditError.style.display = "none";
    } catch (e) {
      elEditError.style.display = "block";
      elEditErrorMsg.textContent = "JSON parse error: " + e.message;
    }
  }

  async function saveDashboard() {
    elEditError.style.display = "none";
    let parsed;
    try {
      parsed = JSON.parse(elEditJsonContent.value);
    } catch (e) {
      elEditError.style.display = "block";
      elEditErrorMsg.textContent = "Cannot save: Invalid JSON format (" + e.message + ")";
      return;
    }

    try {
      const res = await fetch(`/api/dashboards/${state.currentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed, null, 2)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed (" + res.status + ")");
      }
      elModalEdit.style.display = "none";
      await fetchDashboards();
      await loadDashboard(state.currentId);
    } catch (e) {
      elEditError.style.display = "block";
      elEditErrorMsg.textContent = e.message;
    }
  }

  
  async function openBackupsModal() {
    if (!state.currentId) return;
    elBackupsSubtitle.textContent = `Versions for ${state.currentId}.json`;
    elModalBackups.style.display = "flex";
    elBackupsContainer.innerHTML = '<div style="padding: 16px; color: var(--style-text-muted);">Loading backups...</div>';

    try {
      const res = await fetch(`/api/dashboards/${state.currentId}/backups`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const backups = await res.json();

      if (!backups.length) {
        elBackupsContainer.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--style-text-muted);">
            No backups available yet. Editing and saving this dashboard will create version snapshots automatically.
          </div>
        `;
        return;
      }

      let html = `
        <table>
          <thead>
            <tr>
              <th>Backup File</th>
              <th>Created At (${state.timezone})</th>
              <th>Size</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
      `;

      backups.forEach((b) => {
        const formattedDate = formatDateTime(b.timestamp);
        const sizeKb = (b.size / 1024).toFixed(1) + " KB";
        html += `
          <tr>
            <td class="name">${b.filename}</td>
            <td>${formattedDate}</td>
            <td>${sizeKb}</td>
            <td style="text-align: right;">
              <button class="btn btn--sm btn--primary btn-rollback" data-file="${b.filename}" type="button">
                Rollback
              </button>
            </td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
      elBackupsContainer.innerHTML = html;

      
      elBackupsContainer.querySelectorAll(".btn-rollback").forEach((btn) => {
        btn.addEventListener("click", () => {
          const file = btn.dataset.file;
          if (confirm(`Are you sure you want to rollback to version ${file}? Current state will be backed up.`)) {
            performRollback(file);
          }
        });
      });
    } catch (e) {
      elBackupsContainer.innerHTML = `<div style="padding: 16px; color: var(--style-status-danger);">${e.message}</div>`;
    }
  }

  async function performRollback(filename) {
    try {
      const res = await fetch(`/api/dashboards/${state.currentId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Rollback failed");
      }
      elModalBackups.style.display = "none";
      await fetchDashboards();
      await loadDashboard(state.currentId);
    } catch (e) {
      alert("Rollback error: " + e.message);
    }
  }

  
  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.close;
      const modal = document.getElementById(targetId);
      if (modal) modal.style.display = "none";
    });
  });

  
  async function fetchConfig() {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.timezone) state.timezone = cfg.timezone;
      }
    } catch (e) {}
  }

  async function fetchDashboards() {
    try {
      const res = await fetch("/api/dashboards");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.dashboards = await res.json();
      renderSidebar();
    } catch (err) {
      showAlert("Error loading dashboards", err.message);
    }
  }

  function renderSidebar() {
    elSidebarNav.innerHTML = "";
    if (!state.dashboards.length) {
      elSidebarNav.innerHTML = '<div style="padding: 8px 12px; font-size: 13px; color: var(--style-text-muted);">No dashboards found</div>';
      return;
    }

    state.dashboards.forEach((d) => {
      const a = document.createElement("a");
      a.className = "nav-item" + (d.id === state.currentId ? " is-active" : "");
      a.href = "#" + d.id;
      a.innerHTML = `<span>${d.title}</span><span class="nav-badge">${d.panelsCount}</span>`;
      elSidebarNav.appendChild(a);
    });
  }

  async function loadDashboard(id) {
    state.currentId = id;
    renderSidebar();
    hideAlert();
    clearPanels();

    try {
      const res = await fetch(`/api/dashboards/${id}`);
      if (!res.ok) throw new Error("Dashboard not found (" + res.status + ")");
      const data = await res.json();
      state.dashboardData = data;

      elDashboardTitle.textContent = data.title || id;
      elDashboardDesc.textContent = data.description || "";
      elCrumb.textContent = data.title || id;

      await initVariables(data.variables || []);
      renderLayout(data);
      refreshAllPanels();
    } catch (err) {
      showAlert("Failed to load dashboard " + id, err.message);
    }
  }

  async function initVariables(vars) {
    state.variables = {};
    elVarToolbar.innerHTML = "";
    let visibleCount = 0;

    for (const v of vars) {
      const name = v.spec?.name;
      if (!name) continue;

      let currentVal = v.spec?.current?.value || "";
      let options = [];

      
      const querySpec = v.spec?.query?.spec;
      const rawQuery = querySpec?.__legacyStringValue || querySpec?.query || "";
      const match = rawQuery.match(/label_values\((?:([a-zA-Z0-9_]+),\s*)?([a-zA-Z0-9_]+)\)/);

      if (match) {
        const metricName = match[1];
        const labelName = match[2];
        try {
          let url = metricName 
            ? `/api/v1/series?match[]=${encodeURIComponent(metricName)}`
            : `/api/v1/label/${encodeURIComponent(labelName)}/values`;
          const resp = await fetch(url);
          if (resp.ok) {
            const json = await resp.json();
            if (metricName && Array.isArray(json.data)) {
              const vals = new Set();
              json.data.forEach(m => m[labelName] && vals.add(m[labelName]));
              options = Array.from(vals).sort();
            } else if (Array.isArray(json.data)) {
              options = json.data.sort();
            }
          }
        } catch (e) {
          console.warn("Could not query label values for", name, e);
        }
      }

      if (!options.length && currentVal) {
        options = [currentVal];
      }
      if (!currentVal && options.length) {
        currentVal = options[0];
      }
      state.variables[name] = currentVal;

      if (v.spec?.hide !== "hideVariable" && options.length) {
        visibleCount++;
        const item = document.createElement("div");
        item.className = "var-item";

        const label = document.createElement("span");
        label.className = "var-label";
        label.textContent = v.spec.label || name;

        const select = document.createElement("select");
        select.className = "select-ctrl select-ctrl--sm";
        options.forEach(opt => {
          const optEl = document.createElement("option");
          optEl.value = opt;
          optEl.textContent = opt;
          if (opt === currentVal) optEl.selected = true;
          select.appendChild(optEl);
        });

        select.addEventListener("change", (e) => {
          state.variables[name] = e.target.value;
          refreshAllPanels();
        });

        item.appendChild(label);
        item.appendChild(select);
        elVarToolbar.appendChild(item);
      }
    }

    elVarToolbar.style.display = visibleCount > 0 ? "flex" : "none";
  }

  function clearPanels() {
    state.panels.forEach(({ uplot, abortCtrl }) => {
      if (abortCtrl) abortCtrl.abort();
      if (uplot) uplot.destroy();
    });
    state.panels.clear();
    elGrid.innerHTML = "";
  }

  function renderLayout(dashboard) {
    const elements = dashboard.elements || {};
    const layoutItems = dashboard.layout?.spec?.items || [];

    if (!layoutItems.length) {
      Object.entries(elements).forEach(([key, elSpec]) => {
        layoutItems.push({
          spec: {
            element: { name: key },
            width: 12,
            height: 6,
            x: 0,
            y: 0,
          }
        });
      });
    }

    layoutItems.forEach(item => {
      const elRef = item.spec?.element?.name;
      const panelDef = elements[elRef];
      if (!panelDef) return;

      const w = item.spec?.width || 12;
      const h = item.spec?.height || 6;
      const panelEl = createPanelElement(elRef, panelDef.spec, w, h);
      elGrid.appendChild(panelEl);

      state.panels.set(elRef, {
        spec: panelDef.spec,
        el: panelEl,
        uplot: null,
        abortCtrl: null,
      });
    });
  }

  function createPanelElement(id, spec, w, h) {
    const card = document.createElement("div");
    card.id = id;
    card.className = "card panel-card";
    card.style.gridColumn = `span ${w}`;
    card.style.minHeight = `${Math.max(160, h * 38)}px`;

    const vizGroup = spec?.vizConfig?.group || "timeseries";

    const head = document.createElement("div");
    head.className = "panel-card__head";

    const title = document.createElement("h3");
    title.className = "panel-card__title";
    title.textContent = spec.title || "Panel";

    const badge = document.createElement("span");
    badge.className = "nav-badge";
    badge.textContent = vizGroup;

    head.appendChild(title);
    head.appendChild(badge);
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "panel-card__body";
    body.id = `${id}-body`;
    card.appendChild(body);

    return card;
  }

  async function refreshAllPanels() {
    const now = Math.floor(Date.now() / 1000);
    const start = now - state.timeRange;
    const end = now;

    elPromStatus.className = "chip chip--info";
    elPromStatus.textContent = "Querying...";

    const promises = [];
    state.panels.forEach((panelCtrl, panelId) => {
      promises.push(
        renderPanel(panelId, panelCtrl, start, end).catch(err => {
          console.error("Panel render error:", panelId, err);
        })
      );
    });

    await Promise.allSettled(promises);
    elPromStatus.className = "chip chip--success";
    elPromStatus.textContent = "Prometheus: Live";
    elMetaStats.textContent = `Updated: ${formatTime(now)} (${state.timezone}) • ${state.panels.size} panels`;
  }

  async function renderPanel(panelId, ctrl, start, end) {
    if (ctrl.abortCtrl) ctrl.abortCtrl.abort();
    ctrl.abortCtrl = new AbortController();

    const spec = ctrl.spec;
    const vizGroup = spec?.vizConfig?.group || "timeseries";
    const queries = spec?.data?.spec?.queries || [];
    const defaults = spec?.vizConfig?.spec?.fieldConfig?.defaults || {};
    const unit = defaults.unit || "";

    const body = document.getElementById(`${panelId}-body`);
    if (!body) return;

    if (vizGroup === "stat") {
      await renderStatPanel(body, queries, unit, ctrl.abortCtrl.signal);
    } else if (vizGroup === "table") {
      await renderTablePanel(body, queries, unit, ctrl.abortCtrl.signal);
    } else {
      await renderTimeSeriesPanel(panelId, ctrl, body, queries, unit, start, end, ctrl.abortCtrl.signal);
    }
  }

  
  async function renderStatPanel(container, queries, unit, signal) {
    if (!queries.length) return;
    const q = queries[0];
    const expr = interpolateQuery(q.spec?.query?.spec?.expr);
    if (!expr) return;

    try {
      const resp = await fetch(`/api/v1/query?query=${encodeURIComponent(expr)}`, { signal });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const json = await resp.json();
      const results = json.data?.result || [];

      if (!results.length) {
        container.innerHTML = '<div style="font-size: 13px; color: var(--style-text-muted); text-align: center;">No data</div>';
        return;
      }

      let html = '<div class="kpis" style="margin-bottom:0; width:100%;">';
      results.slice(0, 4).forEach(item => {
        const val = item.value ? item.value[1] : null;
        const legend = q.spec?.query?.spec?.legendFormat
          ? renderLegendName(item.metric, q.spec.query.spec.legendFormat)
          : (item.metric.instance || item.metric.gpu_name || item.metric.sensor || "");

        const formatted = formatValue(val, unit);
        html += `
          <div class="metric-card" style="box-shadow:none; border:none; padding:8px 12px; background:transparent;">
            ${legend ? `<div class="metric-card__label">${legend}</div>` : ""}
            <div class="metric-card__value metric-card__value--brand">${formatted}</div>
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (err) {
      if (err.name !== "AbortError") {
        container.innerHTML = `<div style="font-size:12px; color:var(--style-status-danger);">${err.message}</div>`;
      }
    }
  }

  
  async function renderTablePanel(container, queries, unit, signal) {
    if (!queries.length) return;
    const q = queries[0];
    const expr = interpolateQuery(q.spec?.query?.spec?.expr);
    if (!expr) return;

    try {
      const resp = await fetch(`/api/v1/query?query=${encodeURIComponent(expr)}`, { signal });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const json = await resp.json();
      const results = json.data?.result || [];

      if (!results.length) {
        container.innerHTML = '<div style="font-size: 13px; color: var(--style-text-muted); text-align: center;">No data</div>';
        return;
      }

      let html = '<div class="table-wrap"><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>';
      results.forEach(r => {
        const name = renderLegendName(r.metric, q.spec?.query?.spec?.legendFormat);
        const val = r.value ? formatValue(r.value[1], unit) : "-";
        html += `<tr><td class="name">${name}</td><td class="value">${val}</td></tr>`;
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (err) {
      if (err.name !== "AbortError") {
        container.innerHTML = `<div style="font-size:12px; color:var(--style-status-danger);">${err.message}</div>`;
      }
    }
  }

  
  async function renderTimeSeriesPanel(panelId, ctrl, container, queries, unit, start, end, signal) {
    if (!queries.length) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width - 24));
    const step = Math.max(1, Math.floor((end - start) / width));

    const queryPromises = queries.map(async (q) => {
      const expr = interpolateQuery(q.spec?.query?.spec?.expr);
      if (!expr) return [];
      const resp = await fetch(`/api/v1/query_range?query=${encodeURIComponent(expr)}&start=${start}&end=${end}&step=${step}`, { signal });
      if (!resp.ok) return [];
      const json = await resp.json();
      const seriesList = json.data?.result || [];
      return seriesList.map(s => ({
        metric: s.metric,
        values: s.values,
        legendFormat: q.spec?.query?.spec?.legendFormat
      }));
    });

    const resultsByQuery = await Promise.all(queryPromises);
    const allSeries = resultsByQuery.flat();

    if (!allSeries.length) {
      if (!ctrl.uplot) {
        container.innerHTML = '<div style="font-size: 13px; color: var(--style-text-muted); text-align: center;">No metric data for time range</div>';
      }
      return;
    }

    const timestampSet = new Set();
    allSeries.forEach(s => {
      s.values.forEach(([t]) => timestampSet.add(t));
    });
    const timestamps = Array.from(timestampSet).sort((a, b) => a - b);
    if (!timestamps.length) return;

    const timeIndexMap = new Map();
    timestamps.forEach((t, i) => timeIndexMap.set(t, i));

    const uplotData = [timestamps];
    const uplotSeriesConfig = [
      {
        label: "Time",
        value: (u, v) => v ? formatTime(v) : "-",
      }
    ];

    allSeries.forEach((s, idx) => {
      const seriesArr = new Array(timestamps.length).fill(null);

      s.values.forEach(([t, val]) => {
        const pos = timeIndexMap.get(t);
        if (pos !== undefined) {
          const num = parseFloat(val);
          seriesArr[pos] = isNaN(num) ? null : num;
        }
      });
      uplotData.push(seriesArr);

      
      let lastVal = null;
      for (let i = timestamps.length - 1; i >= 0; i--) {
        if (seriesArr[i] !== null && seriesArr[i] !== undefined && !isNaN(seriesArr[i])) {
          lastVal = seriesArr[i];
          break;
        }
      }

      const color = SERIES_COLORS[idx % SERIES_COLORS.length];
      const seriesName = renderLegendName(s.metric, s.legendFormat);

      uplotSeriesConfig.push({
        label: seriesName,
        stroke: color,
        width: 1.5,
        fill: color + "1a",
        points: { show: false },
        _lastVal: lastVal,
        value: (u, v, sIdx, dIdx) => {
          
          const target = (dIdx !== null && dIdx !== undefined && v !== null && v !== undefined)
            ? v
            : lastVal;
          return formatValue(target, unit);
        },
      });
    });

    if (ctrl.uplot && ctrl.uplot.series.length !== uplotSeriesConfig.length) {
      ctrl.uplot.destroy();
      ctrl.uplot = null;
      container.innerHTML = "";
    }

    if (!ctrl.uplot) {
      container.innerHTML = "";
      const height = Math.max(160, Math.floor(container.parentElement.getBoundingClientRect().height - 56));

      const opts = {
        width: width,
        height: height,
        cursor: {
          sync: {
            key: cursorSync.key,
          },
          lock: false,
          points: {
            size: 6,
            fill: "#ffffff",
            stroke: (u, seriesIdx) => u.series[seriesIdx].stroke,
            width: 2,
          }
        },
        scales: {
          x: { time: true },
          y: { auto: true }
        },
        axes: [
          {
            stroke: "#64748B",
            grid: { stroke: "#E2E8F0", width: 1 },
            ticks: { stroke: "#CBD5E1", width: 1 },
            font: '10px "JetBrains Mono", monospace',
            values: (u, vals) => vals.map(v => formatTime(v)),
          },
          {
            stroke: "#64748B",
            grid: { stroke: "#E2E8F0", width: 1 },
            ticks: { stroke: "#CBD5E1", width: 1 },
            font: '10px "JetBrains Mono", monospace',
            values: (u, vals) => vals.map(v => formatValue(v, unit)),
          }
        ],
        series: uplotSeriesConfig,
        plugins: [
          tooltipPlugin(unit),
          legendFallbackPlugin(unit)
        ]
      };

      ctrl.uplot = new uPlot(opts, uplotData, container);
    } else {
      ctrl.uplot.setSize({ width, height: ctrl.uplot.height });
      
      uplotSeriesConfig.forEach((cfg, sIdx) => {
        if (ctrl.uplot.series[sIdx]) {
          ctrl.uplot.series[sIdx]._lastVal = cfg._lastVal;
          ctrl.uplot.series[sIdx].value = cfg.value;
        }
      });
      ctrl.uplot.setData(uplotData);
    }
  }

  
  
  
  function legendFallbackPlugin(unit) {
    function paintLastValues(u) {
      if (!u || !u.root) return;
      const valEls = u.root.querySelectorAll(".u-legend .u-value");
      valEls.forEach((el, i) => {
        const sIdx = i + 1;
        const s = u.series[sIdx];
        if (s) {
          el.textContent = formatValue(s._lastVal, unit);
        }
      });
    }

    return {
      hooks: {
        ready: (u) => paintLastValues(u),
        setData: (u) => paintLastValues(u),
        setCursor: (u) => {
          if (u.cursor.idx == null) {
            paintLastValues(u);
          }
        }
      }
    };
  }

  
  function tooltipPlugin(unit) {
    return {
      hooks: {
        setCursor: (u) => {
          const { left, top, idx } = u.cursor;
          if (idx === null || idx === undefined) {
            elTooltip.style.display = "none";
            return;
          }

          const timeVal = u.data[0][idx];
          if (!timeVal) return;

          let html = `<div class="uplot-tooltip__time">${formatDateTime(timeVal * 1000)}</div>`;
          for (let i = 1; i < u.series.length; i++) {
            const s = u.series[i];
            if (!s.show) continue;
            const val = u.data[i][idx];
            const formatted = formatValue(val, unit);
            html += `
              <div class="uplot-tooltip__row">
                <span>
                  <span class="uplot-tooltip__dot" style="background:${s.stroke};"></span>
                  <span style="color:var(--style-text-secondary);">${s.label}</span>
                </span>
                <span style="font-weight:600; color:var(--style-text-primary); margin-left:12px;">${formatted}</span>
              </div>
            `;
          }

          elTooltip.innerHTML = html;
          elTooltip.style.display = "block";

          const bbox = u.over.getBoundingClientRect();
          const tooltipWidth = elTooltip.offsetWidth;
          let posX = bbox.left + window.scrollX + left + 15;
          let posY = bbox.top + window.scrollY + top - 10;

          if (posX + tooltipWidth > window.innerWidth - 20) {
            posX = bbox.left + window.scrollX + left - tooltipWidth - 15;
          }

          elTooltip.style.left = `${posX}px`;
          elTooltip.style.top = `${posY}px`;
        }
      }
    };
  }

  
  function setupRefresh() {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = null;
    }
    if (state.refreshInterval > 0) {
      state.refreshTimer = setInterval(() => {
        if (state.currentId) {
          refreshAllPanels();
        }
      }, state.refreshInterval * 1000);
    }
  }

  
  elTimeSelect.addEventListener("change", (e) => {
    state.timeRange = parseInt(e.target.value, 10);
    refreshAllPanels();
  });

  elRefreshSelect.addEventListener("change", (e) => {
    state.refreshInterval = parseInt(e.target.value, 10);
    setupRefresh();
  });

  elBtnRefresh.addEventListener("click", () => {
    refreshAllPanels();
  });

  elBtnSubmitLogin.addEventListener("click", login);
  elFormLogin.addEventListener("submit", (e) => {
    e.preventDefault();
    login();
  });
  elFormLogin.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      login();
    }
  });

  elBtnFormatJson.addEventListener("click", formatJsonEditor);
  elBtnSaveDashboard.addEventListener("click", saveDashboard);

  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    if (hash && hash !== state.currentId) {
      loadDashboard(hash);
    }
  });

  window.addEventListener("resize", () => {
    state.panels.forEach(ctrl => {
      if (ctrl.uplot && ctrl.el) {
        const body = ctrl.el.querySelector(".panel-card__body");
        if (body) {
          const w = Math.max(280, Math.floor(body.getBoundingClientRect().width - 24));
          ctrl.uplot.setSize({ width: w, height: ctrl.uplot.height });
        }
      }
    });
  });

  
  async function init() {
    await fetchConfig();
    await checkAuth();
    await fetchDashboards();
    setupRefresh();

    const initialHash = window.location.hash.replace(/^#\/?/, "");
    if (initialHash && state.dashboards.some(d => d.id === initialHash)) {
      loadDashboard(initialHash);
    } else if (state.dashboards.length > 0) {
      loadDashboard(state.dashboards[0].id);
    } else {
      elEmpty.style.display = "block";
    }
  }

  init();
})();
