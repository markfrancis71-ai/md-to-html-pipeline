import { createServer } from 'node:http';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { resolve, basename, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = resolve(__dirname, 'input');
const STYLES   = resolve(__dirname, 'styles.css');
const PORT     = Number(process.env.PORT) || 3737;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB cap per file

function runBuild() {
  return new Promise((res) => {
    let out = '';
    const p = spawn('npm', ['run', 'build'], {
      cwd: __dirname,
      shell: process.platform === 'win32',
    });
    p.stdout.on('data', d => out += d);
    p.stderr.on('data', d => out += d);
    p.on('close', code => res({ ok: code === 0, code, output: out.trim() }));
    p.on('error', e => res({ ok: false, code: -1, output: e.message }));
  });
}

function openBrowser(url) {
  try {
    const cmd = process.platform === 'win32' ? 'cmd'
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
  <title>Upload Markdown · md-to-html-pipeline</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <style>
    .dropzone {
      border: 2px dashed var(--card-border);
      border-radius: 14px;
      padding: 3rem 2rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
      display: block;
    }
    .dropzone:hover, .dropzone.drag-over {
      border-color: var(--teal);
      background: rgba(0, 212, 170, 0.05);
    }
    .dropzone.drag-over { transform: scale(1.01); }
    .dropzone p { color: var(--text-muted); font-size: 0.95rem; margin: 0; }
    .dropzone .dz-cta { color: var(--teal); font-weight: 600; }
    .dropzone .dz-hint { margin-top: 0.5rem !important; font-size: 0.78rem; }
    input[type=file] { display: none; }
    .log { margin-top: 1.5rem; }
    .log:empty { display: none; }
    .log-entry {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 0.82rem;
      line-height: 1.5;
      padding: 0.7rem 0.95rem;
      border-radius: 8px;
      margin: 0.45rem 0;
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
    .log-entry pre { white-space: pre-wrap; margin: 0.5rem 0 0; font-size: 0.78rem; opacity: 0.85; }
    .next-cmd {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      background: rgba(0, 212, 170, 0.08);
      color: var(--teal);
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      display: inline-block;
      margin-top: 0.65rem;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-eyebrow">Uploader</div>
      <h1>Add Markdown to input/</h1>
      <p class="header-meta">Local server · files saved to <code style="font-size:0.85em;color:var(--teal)">input/</code> and the site rebuilds automatically.</p>
      <hr class="header-rule">
    </header>

    <article class="card">
      <label class="dropzone" id="dz">
        <p><span class="dz-cta">Click to choose .md files</span> or drop them here</p>
        <p class="dz-hint">Multiple files supported · existing names will be overwritten · 5 MB max per file</p>
        <input type="file" id="picker" accept=".md,.markdown,text/markdown" multiple>
      </label>
      <div class="log" id="log"></div>
    </article>

    <article class="card">
      <div class="prose">
        <h2>Deploy</h2>
        <p>After uploading, commit and push to publish to GitHub Pages:</p>
        <div class="next-cmd">git add input/ &amp;&amp; git commit -m "Add docs" &amp;&amp; git push</div>
      </div>
    </article>

    <footer>Local upload server on port ${PORT} · stop with Ctrl+C in the terminal</footer>
  </div>

  <script>
    const dz = document.getElementById('dz');
    const picker = document.getElementById('picker');
    const log = document.getElementById('log');

    function logLine(html, isError) {
      const div = document.createElement('div');
      div.className = 'log-entry' + (isError ? ' error' : '');
      div.innerHTML = html;
      log.prepend(div);
    }

    function fmtSize(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1024 / 1024).toFixed(2) + ' MB';
    }

    async function uploadFile(file) {
      try {
        const res = await fetch('/upload', {
          method: 'POST',
          headers: {
            'X-Filename': encodeURIComponent(file.name),
            'Content-Type': 'application/octet-stream',
          },
          body: file,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          logLine('<span style="color:var(--amber)">✗</span> <strong>' + escapeHtml(file.name) + '</strong>: ' + escapeHtml(json.error || res.statusText), true);
          return;
        }
        const verb = json.overwrote ? 'overwrote' : 'saved';
        const buildOk = json.build && json.build.ok;
        const buildLine = buildOk
          ? '<span class="ok">✓ build</span> ' + escapeHtml(json.build.output.split('\\n').slice(-1)[0] || '')
          : '<span style="color:var(--amber)">✗ build failed</span>';
        logLine('<span class="ok">✓</span> ' + verb + ' <strong>' + escapeHtml(json.saved) + '</strong> (' + fmtSize(json.size) + ') — ' + buildLine);
        if (!buildOk && json.build) {
          logLine('<pre>' + escapeHtml(json.build.output) + '</pre>', true);
        }
      } catch (e) {
        logLine('<span style="color:var(--amber)">✗</span> ' + escapeHtml(file.name) + ': ' + escapeHtml(e.message), true);
      }
    }

    async function uploadAll(files) {
      for (const f of Array.from(files)) {
        if (!/\\.(md|markdown)$/i.test(f.name)) {
          logLine('<span style="color:var(--amber)">✗</span> <strong>' + escapeHtml(f.name) + '</strong>: only .md files accepted', true);
          continue;
        }
        await uploadFile(f);
      }
      picker.value = '';
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    picker.addEventListener('change', e => uploadAll(e.target.files));
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      uploadAll(e.dataTransfer.files);
    });
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
      return res.end(readFileSync(STYLES));
    }

    if (req.method === 'POST' && url.pathname === '/upload') {
      const rawName = req.headers['x-filename'];
      if (!rawName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing X-Filename header' }));
      }
      const decoded = decodeURIComponent(String(rawName));
      const safe = basename(decoded);
      if (extname(safe).toLowerCase() !== '.md' && extname(safe).toLowerCase() !== '.markdown') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Only .md / .markdown files accepted' }));
      }

      const dest = resolve(INPUT_DIR, safe);
      if (!dest.startsWith(INPUT_DIR + (process.platform === 'win32' ? '\\' : '/'))) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Invalid filename' }));
      }

      let total = 0;
      const chunks = [];
      for await (const c of req) {
        total += c.length;
        if (total > MAX_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'File exceeds 5 MB limit' }));
        }
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);

      const existed = (() => { try { statSync(dest); return true; } catch { return false; } })();
      writeFileSync(dest, buf);
      const finalName = basename(dest).endsWith('.md') ? basename(dest) : basename(dest, '.markdown') + '.md';
      // If it was .markdown, also save under .md form so build.js (which filters .md) picks it up.
      if (!basename(dest).endsWith('.md')) {
        writeFileSync(resolve(INPUT_DIR, finalName), buf);
      }

      const build = await runBuild();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        saved: finalName,
        size: buf.length,
        overwrote: existed,
        build: { ok: build.ok, output: build.output },
      }));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`✓ Uploader running at ${url}`);
  console.log(`  Drop .md files in your browser → they're saved to input/ and the site rebuilds.`);
  console.log(`  Press Ctrl+C to stop.`);
  if (!process.argv.includes('--no-open')) openBrowser(url);
});
