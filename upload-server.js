import { createServer } from 'node:http';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve, basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PATHS, parseDoc, renderPage } from './renderer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = PATHS.input;
const PORT      = Number(process.env.PORT) || 3737;
const MAX_BYTES = 5 * 1024 * 1024;

const LIVE_URL = 'https://markfrancis71-ai.github.io/md-to-html-pipeline/';

function runCmd(cmd, args, opts = {}) {
  return new Promise(res => {
    let out = '';
    const p = spawn(cmd, args, {
      cwd: __dirname,
      shell: process.platform === 'win32',
      ...opts,
    });
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => res({ ok: code === 0, code, output: out.trim() }));
    p.on('error', e => res({ ok: false, code: -1, output: e.message }));
  });
}

const runBuild = () => runCmd('npm', ['run', 'build']);

async function readRawBody(req, max = MAX_BYTES) {
  let total = 0;
  const chunks = [];
  for await (const c of req) {
    total += c.length;
    if (total > max) throw new Error('Request body exceeds limit');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  if (buf.length === 0) return {};
  return JSON.parse(buf.toString('utf8'));
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function isInsideInputDir(p) {
  const rel = resolve(p);
  const base = INPUT_DIR + (process.platform === 'win32' ? '\\' : '/');
  return rel === INPUT_DIR || rel.startsWith(base);
}

function openBrowser(url) {
  try {
    const cmd  = process.platform === 'win32' ? 'cmd'
               : process.platform === 'darwin' ? 'open'
               : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  } catch { /* user can copy URL */ }
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload · md-to-html-pipeline</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <style>
    .container { max-width: 920px; }

    .dropzone {
      border: 2px dashed var(--card-border);
      border-radius: 14px;
      padding: 2.4rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
      display: block;
    }
    .dropzone:hover, .dropzone.drag-over {
      border-color: var(--teal);
      background: rgba(0, 212, 170, 0.05);
    }
    .dropzone.drag-over { transform: scale(1.005); }
    .dropzone p { color: var(--text-muted); font-size: 0.95rem; margin: 0; }
    .dropzone .dz-cta { color: var(--teal); font-weight: 600; }
    .dropzone .dz-hint { margin-top: 0.5rem !important; font-size: 0.78rem; }
    input[type=file] { display: none; }

    /* Per-file editor */
    .file-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.5rem 1.75rem;
      margin-bottom: 1.25rem;
    }
    .file-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1rem;
      gap: 1rem;
    }
    .file-card-header .label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--teal);
    }
    .file-card-header .size {
      font-size: 0.78rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.85rem 1rem;
    }
    .form-grid .full { grid-column: 1 / -1; }
    .form-field label {
      display: block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-bottom: 0.3rem;
    }
    .form-field input,
    .form-field textarea {
      width: 100%;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 0.55rem 0.75rem;
      color: var(--off-white);
      font-family: inherit;
      font-size: 0.9rem;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .form-field input:focus,
    .form-field textarea:focus {
      outline: none;
      border-color: var(--teal);
      background: rgba(0, 0, 0, 0.4);
    }
    .form-field textarea { resize: vertical; min-height: 60px; line-height: 1.5; }

    .actions {
      display: flex;
      gap: 0.6rem;
      margin-top: 1.1rem;
      flex-wrap: wrap;
      align-items: center;
    }
    .btn {
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 0.55rem 1.05rem;
      border-radius: 6px;
      border: 1px solid var(--card-border);
      background: rgba(0, 212, 170, 0.05);
      color: var(--off-white);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover { border-color: var(--teal); background: rgba(0, 212, 170, 0.12); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary {
      background: var(--teal);
      color: var(--navy);
      border-color: var(--teal);
    }
    .btn.primary:hover { background: #00f0c4; }
    .btn.ghost { background: transparent; }
    .save-status {
      margin-left: auto;
      font-size: 0.8rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }
    .save-status.ok { color: var(--teal); }
    .save-status.err { color: var(--amber); }

    .preview-frame {
      width: 100%;
      height: 480px;
      margin-top: 1.1rem;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      background: var(--navy);
    }
    .preview-frame.hidden { display: none; }

    /* Deploy panel */
    .deploy-panel .deploy-row {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .deploy-panel input[type=text] {
      flex: 1;
      min-width: 240px;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 0.55rem 0.75rem;
      color: var(--off-white);
      font-family: inherit;
      font-size: 0.9rem;
    }
    .deploy-panel input[type=text]:focus { outline: none; border-color: var(--teal); }
    .git-status {
      font-size: 0.82rem;
      color: var(--text-muted);
      margin-bottom: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .git-status.dirty { color: var(--amber); }
    .git-status.clean { color: var(--text-muted); }
    .deploy-log {
      margin-top: 0.85rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.78rem;
      line-height: 1.55;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 280px;
      overflow-y: auto;
      color: rgba(247, 247, 242, 0.78);
    }
    .deploy-log:empty { display: none; }
    .deploy-success {
      color: var(--teal);
      font-weight: 600;
      margin-top: 0.6rem;
      font-size: 0.85rem;
    }

    .log { margin-top: 1.25rem; }
    .log:empty { display: none; }
    .log-entry {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      padding: 0.65rem 0.9rem;
      border-radius: 8px;
      margin: 0.4rem 0;
      background: rgba(0, 212, 170, 0.05);
      border: 1px solid var(--card-border);
      color: rgba(247, 247, 242, 0.85);
    }
    .log-entry.error {
      background: rgba(245, 166, 35, 0.08);
      border-color: rgba(245, 166, 35, 0.3);
      color: var(--amber);
    }
    .log-entry .ok { color: var(--teal); font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-eyebrow">Uploader</div>
      <h1>Add Markdown to input/</h1>
      <p class="header-meta">Drop files, edit front-matter, preview, save, deploy — all from this page.</p>
      <hr class="header-rule">
    </header>

    <article class="card">
      <label class="dropzone" id="dz">
        <p><span class="dz-cta">Click to choose .md files</span> or drop them here</p>
        <p class="dz-hint">Files open below for review &amp; preview before saving · 5 MB max</p>
        <input type="file" id="picker" accept=".md,.markdown,text/markdown" multiple>
      </label>
    </article>

    <div id="files"></div>

    <article class="card deploy-panel">
      <div class="prose"><h2>Deploy</h2></div>
      <div class="git-status" id="git-status">checking git…</div>
      <div class="deploy-row">
        <input type="text" id="deploy-msg" placeholder="Optional commit message">
        <button class="btn primary" id="deploy-btn">Deploy now</button>
        <button class="btn ghost" id="status-refresh">Refresh status</button>
      </div>
      <div class="deploy-log" id="deploy-log"></div>
    </article>

    <article class="card">
      <div class="prose"><h2>Activity</h2></div>
      <div class="log" id="log"></div>
    </article>

    <footer>Local upload server on port ${PORT} · stop with Ctrl+C in the terminal</footer>
  </div>

  <script>
    const dz       = document.getElementById('dz');
    const picker   = document.getElementById('picker');
    const filesEl  = document.getElementById('files');
    const log      = document.getElementById('log');
    const gitEl    = document.getElementById('git-status');
    const deployBtn = document.getElementById('deploy-btn');
    const deployLog = document.getElementById('deploy-log');
    const deployMsg = document.getElementById('deploy-msg');
    const refreshBtn = document.getElementById('status-refresh');

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtSize(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    function logLine(html, isError) {
      const div = document.createElement('div');
      div.className = 'log-entry' + (isError ? ' error' : '');
      div.innerHTML = html;
      log.prepend(div);
    }

    /* ---------- Front-matter parse / build ---------- */

    function parseFrontMatter(text) {
      const m = text.match(/^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?/);
      if (!m) return { fm: {}, body: text };
      const fm = {};
      for (const raw of m[1].split(/\\r?\\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const kv = line.match(/^([a-zA-Z][\\w-]*)\\s*:\\s*(.*)$/);
        if (!kv) continue;
        let v = kv[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        fm[kv[1]] = v;
      }
      return { fm, body: text.slice(m[0].length) };
    }

    function buildFrontMatter(fm) {
      const entries = Object.entries(fm).filter(([_, v]) => v !== '' && v !== null && v !== undefined);
      if (entries.length === 0) return '';
      const lines = ['---'];
      for (const [k, v] of entries) {
        const s = String(v);
        const needsQuote = /[:#&*!|>%@\`,\\[\\]\\{\\}]/.test(s) || /^[\\s'"]/.test(s) || /[\\s'"]$/.test(s);
        lines.push(\`\${k}: \${needsQuote ? JSON.stringify(s) : s}\`);
      }
      lines.push('---');
      return lines.join('\\n') + '\\n\\n';
    }

    function todayISO() {
      return new Date().toISOString().slice(0, 10);
    }

    /* ---------- File card ---------- */

    function makeCard(file, originalText) {
      const { fm, body } = parseFrontMatter(originalText);
      const card = document.createElement('article');
      card.className = 'file-card';

      const filenameDefault = file.name.toLowerCase().endsWith('.markdown')
        ? file.name.slice(0, -('.markdown'.length)) + '.md'
        : file.name;

      const titleDefault = fm.title || (body.match(/^#\\s+(.+?)\\s*$/m) || [, ''])[1] || file.name.replace(/\\.[^.]+$/, '');
      const eyebrowDefault = fm.eyebrow || 'Document';
      const metaDefault    = fm.meta    || new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const dateDefault    = fm.date    || todayISO();
      const summaryDefault = fm.summary || '';

      card.innerHTML = \`
        <div class="file-card-header">
          <span class="label">Editing</span>
          <span class="size">\${escapeHtml(file.name)} · \${fmtSize(file.size)}</span>
        </div>
        <div class="form-grid">
          <div class="form-field"><label>Filename</label><input data-k="filename" value="\${escapeHtml(filenameDefault)}"></div>
          <div class="form-field"><label>Date (YYYY-MM-DD)</label><input data-k="date" value="\${escapeHtml(dateDefault)}"></div>
          <div class="form-field full"><label>Title</label><input data-k="title" value="\${escapeHtml(titleDefault)}"></div>
          <div class="form-field"><label>Eyebrow</label><input data-k="eyebrow" value="\${escapeHtml(eyebrowDefault)}"></div>
          <div class="form-field"><label>Meta</label><input data-k="meta" value="\${escapeHtml(metaDefault)}"></div>
          <div class="form-field full"><label>Summary</label><textarea data-k="summary" rows="2">\${escapeHtml(summaryDefault)}</textarea></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-act="save">Save to input/</button>
          <button class="btn" data-act="toggle-preview">Hide preview</button>
          <button class="btn ghost" data-act="discard">Discard</button>
          <span class="save-status" data-status></span>
        </div>
        <iframe class="preview-frame" sandbox="allow-same-origin"></iframe>
      \`;

      const inputs = card.querySelectorAll('[data-k]');
      const iframe = card.querySelector('.preview-frame');
      const status = card.querySelector('[data-status]');
      const previewBtn = card.querySelector('[data-act="toggle-preview"]');

      function readForm() {
        const out = {};
        inputs.forEach(i => out[i.dataset.k] = i.value);
        return out;
      }

      function buildContent() {
        const v = readForm();
        const fmObj = {
          title:   v.title,
          eyebrow: v.eyebrow,
          meta:    v.meta,
          date:    v.date,
          summary: v.summary,
        };
        return buildFrontMatter(fmObj) + body;
      }

      let previewSeq = 0;
      async function refreshPreview() {
        const seq = ++previewSeq;
        const v = readForm();
        try {
          const r = await fetch('/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: buildContent(), filename: v.filename || file.name }),
          });
          if (seq !== previewSeq) return;
          const html = await r.text();
          iframe.srcdoc = html;
        } catch (e) { /* network blip; ignore */ }
      }

      let debounceT;
      inputs.forEach(i => i.addEventListener('input', () => {
        status.textContent = 'edited';
        status.className = 'save-status';
        clearTimeout(debounceT);
        debounceT = setTimeout(refreshPreview, 300);
      }));

      card.addEventListener('click', async (e) => {
        const act = e.target.dataset && e.target.dataset.act;
        if (!act) return;
        if (act === 'discard') { card.remove(); return; }
        if (act === 'toggle-preview') {
          iframe.classList.toggle('hidden');
          previewBtn.textContent = iframe.classList.contains('hidden') ? 'Show preview' : 'Hide preview';
          return;
        }
        if (act === 'save') {
          const v = readForm();
          if (!/\\.md$/i.test(v.filename)) {
            status.textContent = 'filename must end .md';
            status.className = 'save-status err';
            return;
          }
          status.textContent = 'saving…';
          status.className = 'save-status';
          try {
            const r = await fetch('/upload', {
              method: 'POST',
              headers: {
                'X-Filename': encodeURIComponent(v.filename),
                'Content-Type': 'application/octet-stream',
              },
              body: buildContent(),
            });
            const json = await r.json();
            if (!r.ok) throw new Error(json.error || r.statusText);
            const verb = json.overwrote ? 'overwrote' : 'saved';
            const buildOk = json.build && json.build.ok;
            status.textContent = buildOk ? \`✓ \${verb} · build OK\` : \`✓ \${verb} · build failed\`;
            status.className = 'save-status ' + (buildOk ? 'ok' : 'err');
            logLine(\`<span class="ok">✓</span> \${verb} <strong>\${escapeHtml(json.saved)}</strong> (\${fmtSize(json.size)})\`);
            if (!buildOk) logLine(\`<pre style="white-space:pre-wrap;margin:0">\${escapeHtml(json.build.output)}</pre>\`, true);
            refreshGitStatus();
          } catch (err) {
            status.textContent = '✗ ' + err.message;
            status.className = 'save-status err';
            logLine(\`<span style="color:var(--amber)">✗</span> \${escapeHtml(file.name)}: \${escapeHtml(err.message)}\`, true);
          }
        }
      });

      filesEl.appendChild(card);
      refreshPreview();
    }

    /* ---------- File picking ---------- */

    function readAsText(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(file);
      });
    }

    async function handleFiles(files) {
      for (const f of Array.from(files)) {
        if (!/\\.(md|markdown)$/i.test(f.name)) {
          logLine(\`<span style="color:var(--amber)">✗</span> <strong>\${escapeHtml(f.name)}</strong>: only .md / .markdown files\`, true);
          continue;
        }
        try {
          const text = await readAsText(f);
          makeCard(f, text);
        } catch (e) {
          logLine(\`<span style="color:var(--amber)">✗</span> \${escapeHtml(f.name)}: \${escapeHtml(e.message)}\`, true);
        }
      }
      picker.value = '';
    }

    picker.addEventListener('change', e => handleFiles(e.target.files));
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    /* ---------- Git status + Deploy ---------- */

    async function refreshGitStatus() {
      gitEl.textContent = 'checking git…';
      gitEl.className = 'git-status';
      try {
        const r = await fetch('/git-status');
        const j = await r.json();
        if (j.total === 0) {
          gitEl.textContent = 'input/ matches HEAD — nothing to deploy.';
          gitEl.className = 'git-status clean';
        } else {
          gitEl.textContent = \`input/ has \${j.total} change\${j.total === 1 ? '' : 's'} (\${j.untracked} new, \${j.modified} modified) ready to deploy.\`;
          gitEl.className = 'git-status dirty';
        }
      } catch (e) {
        gitEl.textContent = 'git status unavailable: ' + e.message;
        gitEl.className = 'git-status err';
      }
    }

    refreshBtn.addEventListener('click', refreshGitStatus);

    deployBtn.addEventListener('click', async () => {
      deployBtn.disabled = true;
      deployLog.textContent = 'Running git add → commit → push…\\n';
      try {
        const r = await fetch('/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: deployMsg.value || undefined }),
        });
        const j = await r.json();
        if (j.nothingToCommit) {
          deployLog.textContent = (j.log || '') + '\\n\\nNothing to commit — input/ matches HEAD.';
        } else if (!j.ok) {
          deployLog.textContent = (j.log || '') + '\\n\\n✗ ' + (j.error || 'deploy failed');
        } else {
          deployLog.textContent = j.log + '\\n\\n✓ Deployed. Pages will rebuild in ~30–60s.';
          if (j.liveUrl) {
            const link = document.createElement('div');
            link.className = 'deploy-success';
            link.innerHTML = \`Live: <a href="\${j.liveUrl}" target="_blank" style="color:var(--teal)">\${j.liveUrl}</a>\`;
            deployLog.after(link);
            setTimeout(() => link.remove(), 30000);
          }
          deployMsg.value = '';
        }
        refreshGitStatus();
      } catch (e) {
        deployLog.textContent += '\\n✗ ' + e.message;
      } finally {
        deployBtn.disabled = false;
      }
    });

    refreshGitStatus();
  </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }

    if (req.method === 'GET' && url.pathname === '/styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(readFileSync(PATHS.styles));
    }

    if (req.method === 'POST' && url.pathname === '/upload') {
      const rawName = req.headers['x-filename'];
      if (!rawName) return sendJSON(res, 400, { error: 'Missing X-Filename header' });
      const decoded = decodeURIComponent(String(rawName));
      const safe = basename(decoded);
      const ext = extname(safe).toLowerCase();
      if (ext !== '.md' && ext !== '.markdown') {
        return sendJSON(res, 400, { error: 'Only .md / .markdown files accepted' });
      }
      const finalName = ext === '.markdown' ? basename(safe, '.markdown') + '.md' : safe;
      const dest = resolve(INPUT_DIR, finalName);
      if (!isInsideInputDir(dest)) {
        return sendJSON(res, 400, { error: 'Invalid filename' });
      }
      const buf = await readRawBody(req);
      const existed = (() => { try { statSync(dest); return true; } catch { return false; } })();
      writeFileSync(dest, buf);
      const build = await runBuild();
      return sendJSON(res, 200, { saved: finalName, size: buf.length, overwrote: existed, build });
    }

    if (req.method === 'POST' && url.pathname === '/preview') {
      const body = await readJsonBody(req);
      const filename = String(body.filename || 'preview.md');
      const slug = basename(filename, extname(filename)) || 'preview';
      const doc = parseDoc(String(body.markdown || ''), { fallbackSlug: slug });
      const tpl = readFileSync(PATHS.template, 'utf8');
      const styles = readFileSync(PATHS.styles, 'utf8');
      const generated = new Date().toISOString().slice(0, 10);
      let html = renderPage(doc, { template: tpl, generated });
      html = html.replace(
        '<link rel="stylesheet" href="styles.css">',
        `<style>${styles}</style>`,
      );
      // Disable the back-link in preview
      html = html.replace(
        '<nav class="page-nav">',
        '<nav class="page-nav" style="display:none">',
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    if (req.method === 'GET' && url.pathname === '/git-status') {
      const r = await runCmd('git', ['status', '--porcelain', 'input/']);
      const lines = r.output.split('\n').filter(Boolean);
      const untracked = lines.filter(l => l.startsWith('??')).length;
      const modified  = lines.length - untracked;
      return sendJSON(res, 200, { ok: r.ok, untracked, modified, total: lines.length, lines });
    }

    if (req.method === 'POST' && url.pathname === '/deploy') {
      const body = await readJsonBody(req).catch(() => ({}));
      const message = (body.message && String(body.message).trim())
                   || `Update via uploader (${new Date().toISOString().slice(0, 10)})`;
      const log = [];

      const add = await runCmd('git', ['add', 'input/']);
      log.push(`$ git add input/\n${add.output}`.trim());
      if (!add.ok) return sendJSON(res, 500, { ok: false, log: log.join('\n\n'), error: 'git add failed' });

      const diff = await runCmd('git', ['diff', '--cached', '--quiet']);
      if (diff.ok) {
        return sendJSON(res, 200, { ok: true, log: log.join('\n\n'), nothingToCommit: true });
      }

      const commit = await runCmd('git', ['commit', '-m', message]);
      log.push(`$ git commit -m "${message}"\n${commit.output}`.trim());
      if (!commit.ok) return sendJSON(res, 500, { ok: false, log: log.join('\n\n'), error: 'commit failed' });

      const push = await runCmd('git', ['push']);
      log.push(`$ git push\n${push.output}`.trim());
      if (!push.ok) return sendJSON(res, 500, { ok: false, log: log.join('\n\n'), error: 'push failed' });

      return sendJSON(res, 200, { ok: true, log: log.join('\n\n'), liveUrl: LIVE_URL });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`✓ Uploader running at ${url}`);
  console.log(`  · Drop .md files → edit front-matter → preview → save → deploy.`);
  console.log(`  Press Ctrl+C to stop.`);
  if (!process.argv.includes('--no-open')) openBrowser(url);
});
