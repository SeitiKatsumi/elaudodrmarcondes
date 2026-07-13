const app = document.querySelector("#app");
const APP_VERSION = "v1.0.0";

let state = {
  view: "dashboard",
  dashboard: null,
  exams: [],
  integrations: [],
  settings: null,
  selectedIntegrationCalls: []
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json();
  if (!res.ok || data.success === false) throw new Error(data.error || "Falha na requisição.");
  return data;
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR");
}

function fmtDuration(start, end) {
  if (!start || !end) return "-";
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "-";
  const seconds = Math.round(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}min ${rest}s`;
}

function reportToText(report) {
  if (!report) return "";
  if (report.introducao || report.laudo_tecnico) {
    return [
      report.titulo,
      "",
      "1. Introdução",
      report.introducao || report.descricao_geral || "",
      "",
      "2. Laudo Técnico",
      report.laudo_tecnico || report.analise_tecnica || "",
      "",
      "3. Conclusão",
      report.conclusao || "",
      "",
      report.observacoes || ""
    ].filter((item) => item !== null && item !== undefined).join("\n");
  }
  return [
    report.titulo,
    "",
    "Descrição geral",
    report.descricao_geral,
    "",
    "Achados principais",
    ...(report.achados_principais || []).map((item) => `- ${item}`),
    "",
    "Análise técnica",
    report.analise_tecnica,
    "",
    "Conclusão",
    report.conclusao,
    "",
    "Observações",
    report.observacoes
  ].join("\n");
}

function loginView(error = "") {
  app.innerHTML = `
    <section class="login-shell">
      <form class="login-panel" id="loginForm">
        <div class="brand">
          <div class="brand-mark"></div>
          <div>
            <h1>Laudos Dr. Marcondes</h1>
            <p>MVP médico com IA operacional</p>
          </div>
        </div>
        <label>Senha administrativa
          <input type="password" name="password" autocomplete="current-password" required autofocus>
        </label>
        ${error ? `<p style="color: var(--danger)">${error}</p>` : ""}
        <div style="height: 18px"></div>
        <button type="submit">Entrar</button>
      </form>
    </section>
  `;
  document.querySelector("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ password: event.target.password.value }) });
      await boot();
    } catch (err) {
      loginView(err.message);
    }
  });
}

function shell(content) {
  const nav = [
    ["dashboard", "Dashboard"],
    ["manual", "Geração manual"],
    ["history", "Histórico"],
    ["integrations", "APIs de Integração"],
    ["settings", "Configurações"],
    ["manualHelp", "Manual de uso"]
  ];
  app.innerHTML = `
    <section class="layout">
      <div class="mobile-topbar">
        <button class="secondary" id="menuToggle" type="button">Menu</button>
        <div class="brand mobile-brand">
          <div class="brand-mark"></div>
          <div>
            <h1>Elevenmind</h1>
            <p>Dr. Marcondes</p>
            <span class="app-version">${APP_VERSION}</span>
          </div>
        </div>
      </div>
      <button class="menu-backdrop" id="menuBackdrop" type="button" aria-label="Fechar menu"></button>
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark"></div>
          <div>
            <h1>Elevenmind</h1>
            <p>Dr. Marcondes</p>
            <span class="app-version">${APP_VERSION}</span>
          </div>
        </div>
        <nav class="nav">
          ${nav.map(([id, label]) => `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${label}</button>`).join("")}
          <button class="danger" id="logout">Sair</button>
        </nav>
      </aside>
      <section class="content">
        ${content}
        <footer class="privacy-footer">
          Sistema privado de apoio à elaboração de laudos. Conteúdo protegido, agente não público e uso orientado à conformidade com LGPD, compliance médico e diretrizes éticas do CRM para tratamento de dados do paciente.
        </footer>
      </section>
    </section>
  `;
  document.querySelector("#menuToggle")?.addEventListener("click", () => {
    document.body.classList.add("menu-open");
  });
  document.querySelector("#menuBackdrop")?.addEventListener("click", () => {
    document.body.classList.remove("menu-open");
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      document.body.classList.remove("menu-open");
      await render();
    });
  });
  document.querySelector("#logout").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST", body: "{}" });
    loginView();
  });
}

function renderDashboard() {
  const dash = state.dashboard;
  shell(`
    <div class="topbar">
      <div><h2>Dashboard</h2><p class="muted">Monitoramento operacional dos laudos automatizados</p></div>
      <button class="secondary" id="refresh">Atualizar</button>
    </div>
    <section class="privacy-banner">
      <div>
        <b>Ambiente privado e protegido</b>
        <p>Este agente não é público. Os laudos e dados de pacientes são tratados como conteúdo sensível, com uso orientado à LGPD, compliance médico e diretrizes éticas do CRM.</p>
      </div>
    </section>
    <section class="grid metrics">
      <article class="card"><span class="metric-value">${dash.metrics.total}</span><span class="muted">Laudos gerados</span></article>
      <article class="card"><span class="metric-value">${dash.metrics.completed}</span><span class="muted">Concluídos</span></article>
      <article class="card"><span class="metric-value">${dash.metrics.errors}</span><span class="muted">Erros</span></article>
      <article class="card"><span class="metric-value">${dash.metrics.integrations}</span><span class="muted">Integrações</span></article>
    </section>
    <section class="grid two-col">
      <article class="panel"><h3>Exames recentes</h3>${examTable(dash.recentExams)}</article>
      <article class="panel"><h3>Erros recentes</h3>${dash.recentErrors.length ? dash.recentErrors.map((e) => `<p><b>${fmtDate(e.created_at)}</b><br><span class="muted">${e.error}</span></p>`).join("") : "<p class='muted'>Nenhum erro registrado.</p>"}</article>
    </section>
  `);
  document.querySelector("#refresh").addEventListener("click", loadAndRender);
}

function examTable(rows) {
  if (!rows.length) return "<p class='muted'>Nenhum exame recebido.</p>";
  return `
    <div class="mobile-exam-list">
      ${rows.map((exam) => `
        <article class="mobile-exam-card">
          <div><span>Data</span><b>${fmtDate(exam.created_at)}</b></div>
          <div><span>Paciente</span><b>${exam.patient_name || exam.external_id || "-"}</b></div>
          <div><span>Exame</span><b>${exam.exam_type || "Cartografia Vascular"}</b></div>
          <div><span>Tempo</span><b>${fmtDuration(exam.created_at, exam.completed_at)}</b></div>
          <div><span>Status</span><span class="status ${exam.status}">${statusLabel(exam.status)}</span></div>
        </article>
      `).join("")}
    </div>
    <table class="desktop-table">
      <thead><tr><th>Data</th><th>Paciente</th><th>Exame</th><th>Tempo</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map((exam) => `
          <tr>
            <td>${fmtDate(exam.created_at)}</td>
            <td>${exam.patient_name || exam.external_id || "-"}</td>
            <td>${exam.exam_type || "Cartografia Vascular"}</td>
            <td>${fmtDuration(exam.created_at, exam.completed_at)}</td>
            <td><span class="status ${exam.status}">${statusLabel(exam.status)}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function statusLabel(status) {
  const labels = { completed: "CONCLUÍDO", error: "ERRO", processing: "PROCESSANDO" };
  return labels[status] || String(status || "-").toUpperCase();
}

function renderManual(result = null, error = "", loading = false) {
  shell(`
    <div class="topbar"><div><h2>Geração manual</h2><p class="muted">Upload direto para avaliação e emissão do laudo</p></div></div>
    <section class="grid two-col">
      <form class="panel grid" id="manualForm">
        <label class="drop full">Imagens PNG/JPEG ou PDF
          <input type="file" name="image" accept="image/png,image/jpeg,application/pdf,.pdf" multiple required>
        </label>
        <div class="form-grid">
          <label>Nome do paciente<input name="patient_name"></label>
          <label>Idade<input name="age"></label>
          <label>Sexo<input name="sex"></label>
          <label>Lateralidade<select name="laterality"><option value="">Não informado</option><option value="Direito">Direito</option><option value="Esquerdo">Esquerdo</option><option value="Bilateral">Bilateral</option></select></label>
          <label>Tipo de exame<input name="exam_type" value="Cartografia Vascular"></label>
          <label>Identificador externo<input name="external_id"></label>
          <label>Médico solicitante<input name="requester_name"></label>
          <label class="full">Observações clínicas<textarea name="clinical_notes"></textarea></label>
        </div>
        ${error ? `<p style="color: var(--danger)">${error}</p>` : ""}
        <button type="submit" ${loading ? "disabled" : ""}>${loading ? "Gerando laudo..." : "Gerar laudo"}</button>
      </form>
      <article class="panel">
        <h3>Resultado</h3>
        ${loading ? loaderPanel() : result ? resultPanel(result) : "<p class='muted'>O laudo gerado aparecerá aqui.</p>"}
      </article>
    </section>
  `);
  document.querySelector("#manualForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    renderManual(null, "", true);
    try {
      const data = await api("/api/admin/manual-laudo", { method: "POST", body: form });
      renderManual(data);
      await loadState();
    } catch (err) {
      renderManual(null, err.message);
    }
  });
  bindReportActions(result);
}

function loaderPanel() {
  return `
    <div class="loader-box" role="status" aria-live="polite">
      <div>
        <div class="pulse-loader"></div>
        <strong>Gerando o laudo...</strong>
        <p class="muted">Os arquivos estão sendo analisados e o texto médico estruturado está sendo preparado.</p>
      </div>
    </div>
  `;
}

function resultPanel(result) {
  const text = reportToText(result.laudo);
  return `
    <div class="actions">
      <button class="secondary" data-copy-report>Copiar</button>
      <button class="secondary" data-export-text>Exportar TXT</button>
      <button class="secondary" data-export-json>Exportar JSON</button>
    </div>
    <pre class="report" id="reportText">${text}</pre>
    <script type="application/json" id="reportJson">${JSON.stringify(result).replace(/</g, "\\u003c")}</script>
  `;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bindReportActions(result) {
  if (!result) return;
  const text = reportToText(result.laudo);
  const json = JSON.stringify(result, null, 2);
  document.querySelector("[data-copy-report]")?.addEventListener("click", () => navigator.clipboard.writeText(text));
  document.querySelector("[data-export-text]")?.addEventListener("click", () => download("laudo.txt", text, "text/plain"));
  document.querySelector("[data-export-json]")?.addEventListener("click", () => download("laudo.json", json, "application/json"));
}

function renderHistory() {
  shell(`
    <div class="topbar"><div><h2>Histórico</h2><p class="muted">Últimos exames processados pela plataforma</p></div><button class="secondary" id="refresh">Atualizar</button></div>
    <section class="panel">${examTable(state.exams)}</section>
  `);
  document.querySelector("#refresh").addEventListener("click", loadAndRender);
}

function integrationInstructions(item) {
  const endpoint = `${item.appUrl || ""}/api/integrations/${item.id}/laudo`;
  return `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer SUA_API_KEY" \\
  -F "image=@exame.jpg" \\
  -F "image=@imagem-complementar.png" \\
  -F "image=@cartografia-completa.pdf" \\
  -F "nome_paciente=Paciente Exemplo" \\
  -F "tipo_exame=Cartografia Vascular"`;
}

function renderIntegrations(newIntegration = null, error = "") {
  const baseUrl = (state.appUrl || "https://laudosdrmarcondes.dna11.com.br").replace(/\/$/, "");
  shell(`
    <div class="topbar"><div><h2>APIs de Integração</h2><p class="muted">Crie endpoints autenticados para sistemas externos</p></div></div>
    <section class="grid two-col">
      <article class="panel">
        <h3>Nova integração</h3>
        <form class="grid" id="integrationForm">
          <label>Nome da integração<input name="name" placeholder="Sistema parceiro, clínica ou origem"></label>
          ${error ? `<p style="color: var(--danger)">${error}</p>` : ""}
          <button type="submit">Gerar API Key</button>
        </form>
        ${newIntegration ? `<p>API Key criada:</p><p class="api-key">${newIntegration.api_key}</p><p class="muted">Guarde esta chave agora. Depois ela não será exibida novamente.</p>` : ""}
      </article>
      <article class="panel">
        <h3>Endpoints externos</h3>
        <div class="endpoint-list">
          <div class="endpoint-item">
            <b>API principal</b>
            <code>POST ${baseUrl}/api/laudo</code>
          </div>
          <div class="endpoint-item">
            <b>API por integração</b>
            <code>POST ${baseUrl}/api/integrations/{integration_id}/laudo</code>
          </div>
        </div>
        <h3>Instruções de uso</h3>
        <pre class="report">${integrationInstructions({ id: "{integration_id}", appUrl: "https://laudosdrmarcondes.dna11.com.br" })}</pre>
      </article>
    </section>
    <section class="panel">
      <h3>Integrações cadastradas</h3>
      ${state.integrations.length ? `
        <table>
          <thead><tr><th>Nome</th><th>Endpoint</th><th>Chave</th><th>Chamadas</th><th>Status</th><th>Acoes</th></tr></thead>
          <tbody>
            ${state.integrations.map((item) => {
              const endpoint = `${item.appUrl || state.appUrl || ""}/api/integrations/${item.id}/laudo`;
              return `<tr>
                <td>${item.name}</td>
                <td><span class="muted">${endpoint}</span></td>
                <td>${item.api_key_preview}</td>
                <td>${item.call_count}</td>
                <td><span class="status ${item.active ? "" : "error"}">${item.active ? "ATIVA" : "INATIVA"}</span></td>
                <td class="actions">
                  <button class="secondary" data-copy="${endpoint}">Copiar endpoint</button>
                  <button class="secondary" data-toggle="${item.id}" data-active="${item.active ? "0" : "1"}">${item.active ? "Desativar" : "Ativar"}</button>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      ` : "<p class='muted'>Nenhuma integração criada.</p>"}
    </section>
  `);
  document.querySelector("#integrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api("/api/admin/integrations", { method: "POST", body: JSON.stringify({ name: event.target.name.value }) });
      await loadState();
      renderIntegrations(data.integration);
    } catch (err) {
      renderIntegrations(null, err.message);
    }
  });
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", () => navigator.clipboard.writeText(button.dataset.copy)));
  document.querySelectorAll("[data-toggle]").forEach((button) => button.addEventListener("click", async () => {
    await api(`/api/admin/integrations/${button.dataset.toggle}`, { method: "PATCH", body: JSON.stringify({ active: button.dataset.active }) });
    await loadAndRender();
  }));
}

function renderSettings(saved = false, error = "") {
  const settings = state.settings || {};
  shell(`
    <div class="topbar">
      <div><h2>Configurações</h2><p class="muted">Motor de geração dos laudos e credenciais da API ChatGPT/OpenAI</p></div>
    </div>
    <section class="grid two-col">
      <form class="panel grid" id="settingsForm">
        <label>
          Ativar geração com OpenAI
          <select name="openai_enabled">
            <option value="true" ${settings.openai_enabled ? "selected" : ""}>Ativada</option>
            <option value="false" ${!settings.openai_enabled ? "selected" : ""}>Desativada, usar heurística local</option>
          </select>
        </label>
        <label>
          Modelo
          <select name="openai_model" id="modelSelect">
            ${(settings.available_models || []).map((model) => `<option value="${model}" ${settings.openai_model === model ? "selected" : ""}>${model}</option>`).join("")}
            <option value="custom">Outro modelo</option>
          </select>
        </label>
        <label>
          Nivel de detalhamento do laudo
          <select name="report_detail_level">
            <option value="detalhado" ${settings.report_detail_level === "detalhado" ? "selected" : ""}>Detalhado e rico</option>
            <option value="equilibrado" ${settings.report_detail_level === "equilibrado" ? "selected" : ""}>Equilibrado</option>
            <option value="objetivo" ${settings.report_detail_level === "objetivo" ? "selected" : ""}>Objetivo</option>
          </select>
        </label>
        <label class="full hidden" id="customModelWrap">
          Nome do modelo personalizado
          <input name="custom_model" placeholder="ex: gpt-5.5">
        </label>
        <label class="full">
          API Key da OpenAI
          <input name="openai_api_key" type="password" placeholder="${settings.openai_api_key_configured ? "Chave já configurada. Preencha apenas para substituir." : "sk-..."}">
        </label>
        <label class="full" style="display:flex; grid-template-columns:auto 1fr; align-items:center;">
          <input type="checkbox" name="clear_openai_api_key" style="width:auto">
          Remover chave salva
        </label>
        <label class="full">
          Prompt macro do agente
          <textarea name="report_macro_prompt" style="min-height:180px">${settings.report_macro_prompt || ""}</textarea>
        </label>
        <label class="full">
          Prompt de nuances tecnicas e preferencias do Dr. Marcondes
          <textarea name="report_nuance_prompt" style="min-height:260px">${settings.report_nuance_prompt || settings.report_agent_prompt || ""}</textarea>
        </label>
        <label class="full">
          Prompt legado complementar
          <textarea name="report_agent_prompt" style="min-height:140px">${settings.report_agent_prompt || ""}</textarea>
        </label>
        ${saved ? "<p style='color: var(--green)'>Configurações salvas.</p>" : ""}
        ${error ? `<p style="color: var(--danger)">${error}</p>` : ""}
        <button type="submit">Salvar configurações</button>
      </form>
      <article class="panel">
        <h3>Como funciona</h3>
        <p class="muted">Quando ativado, o sistema envia a imagem para a OpenAI Responses API usando entrada visual em base64 e pede um JSON estruturado de laudo. Se a chamada falhar, o laudo ainda é gerado pelo motor heurístico local.</p>
        <p><b>Status da chave:</b> ${settings.openai_api_key_configured ? "configurada" : "não configurada"}</p>
        <p><b>Modelo atual:</b> ${settings.openai_model || "-"}</p>
        <p><b>Detalhamento:</b> ${settings.report_detail_level || "detalhado"}</p>
        <pre class="report">Variaveis equivalentes no .env:
OPENAI_API_KEY=sk-...
OPENAI_MODEL=${settings.openai_model || "gpt-5.5"}
OPENAI_ENABLED=${settings.openai_enabled ? "true" : "false"}</pre>
      </article>
    </section>
  `);
  const select = document.querySelector("#modelSelect");
  const customWrap = document.querySelector("#customModelWrap");
  select.addEventListener("change", () => customWrap.classList.toggle("hidden", select.value !== "custom"));
  document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const selected = form.get("openai_model");
    const custom = (form.get("custom_model") || "").trim();
    try {
      const data = await api("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({
          openai_enabled: form.get("openai_enabled") === "true",
          openai_model: selected === "custom" ? custom : selected,
          openai_api_key: form.get("openai_api_key"),
          clear_openai_api_key: form.get("clear_openai_api_key") === "on",
          report_detail_level: form.get("report_detail_level"),
          report_macro_prompt: form.get("report_macro_prompt"),
          report_nuance_prompt: form.get("report_nuance_prompt"),
          report_agent_prompt: form.get("report_agent_prompt")
        })
      });
      state.settings = data.settings;
      renderSettings(true);
    } catch (err) {
      renderSettings(false, err.message);
    }
  });
}

function renderManualHelp() {
  const baseUrl = (state.appUrl || "https://laudosdrmarcondes.dna11.com.br").replace(/\/$/, "");
  shell(`
    <div class="topbar">
      <div><h2>Manual de uso</h2><p class="muted">Guia operacional para gerar laudos e integrar sistemas externos</p></div>
    </div>
    <section class="grid two-col">
      <article class="panel">
        <h3>Fluxo administrativo</h3>
        <ol class="manual-list">
          <li>Acesse o painel com a senha administrativa configurada no CapRover.</li>
          <li>Abra Configurações e confirme se a OpenAI está ativada.</li>
          <li>Selecione o modelo desejado. Para maior qualidade, use gpt-5.5.</li>
          <li>Use Geração manual para enviar uma ou mais imagens PNG/JPEG ou PDFs.</li>
          <li>Revise o laudo gerado antes de qualquer uso clínico.</li>
        </ol>
      </article>
      <article class="panel">
        <h3>Geração manual</h3>
        <ol class="manual-list">
          <li>Clique em Geração manual.</li>
          <li>Selecione uma ou várias imagens/PDFs do exame.</li>
          <li>Preencha dados opcionais como paciente, idade, sexo, tipo de exame e observações clínicas.</li>
          <li>Clique em Gerar laudo e aguarde o indicador de processamento.</li>
          <li>Copie o texto ou exporte em TXT/JSON.</li>
        </ol>
      </article>
      <article class="panel">
        <h3>API externa principal</h3>
        <p class="muted">Use esta rota quando quiser integrar um sistema externo com uma chave master.</p>
        <pre class="report">POST ${baseUrl}/api/laudo
Header:
Authorization: Bearer SUA_API_KEY

Campos multipart:
image=@exame-1.jpg
image=@exame-2.png
image=@cartografia-completa.pdf
nome_paciente=Paciente Exemplo
tipo_exame=Cartografia Vascular</pre>
      </article>
      <article class="panel">
        <h3>APIs por integração</h3>
        <ol class="manual-list">
          <li>Abra APIs de Integração.</li>
          <li>Crie uma nova integração com o nome do sistema parceiro.</li>
          <li>Guarde a API Key exibida uma única vez.</li>
          <li>Envie imagens ou PDFs para o endpoint exclusivo da integração.</li>
          <li>Acompanhe chamadas e status no painel.</li>
        </ol>
        <pre class="report">POST ${baseUrl}/api/integrations/{integration_id}/laudo
Header:
x-api-key: API_KEY_DA_INTEGRACAO</pre>
      </article>
      <article class="panel">
        <h3>Exemplo cURL</h3>
        <pre class="report">curl -X POST "${baseUrl}/api/laudo" \\
  -H "Authorization: Bearer SUA_API_KEY" \\
  -F "image=@exame-1.jpg" \\
  -F "image=@exame-2.png" \\
  -F "image=@cartografia-completa.pdf" \\
  -F "nome_paciente=Paciente Exemplo" \\
  -F "tipo_exame=Cartografia Vascular"</pre>
      </article>
      <article class="panel">
        <h3>Segurança e validação</h3>
        <ul class="manual-list">
          <li>Não compartilhe API Keys em prints, mensagens ou repositórios.</li>
          <li>Revogue chaves expostas imediatamente.</li>
          <li>Todo laudo gerado automaticamente deve ser revisado por médico habilitado.</li>
          <li>Use volumes persistentes no CapRover para preservar banco e uploads.</li>
        </ul>
      </article>
    </section>
  `);
}

async function loadState() {
  const [dashboard, exams, integrations, settings] = await Promise.all([
    api("/api/admin/dashboard"),
    api("/api/admin/exams"),
    api("/api/admin/integrations"),
    api("/api/admin/settings")
  ]);
  state.dashboard = dashboard;
  state.exams = exams.exams;
  state.integrations = integrations.integrations.map((item) => ({ ...item, appUrl: integrations.appUrl }));
  state.appUrl = integrations.appUrl;
  state.settings = settings.settings;
}

async function render() {
  if (state.view === "dashboard") return renderDashboard();
  if (state.view === "manual") return renderManual();
  if (state.view === "history") return renderHistory();
  if (state.view === "integrations") return renderIntegrations();
  if (state.view === "settings") return renderSettings();
  if (state.view === "manualHelp") return renderManualHelp();
}

async function loadAndRender() {
  await loadState();
  await render();
}

async function boot() {
  try {
    await api("/api/admin/me");
    await loadAndRender();
  } catch (_err) {
    loginView();
  }
}

boot();
