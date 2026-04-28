import { readFileSync, writeFileSync, watch } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUT  = resolve(__dirname, 'input.md');
const TEMPLATE = resolve(__dirname, 'template.html');
const OUTPUT = resolve(__dirname, 'index.html');

marked.setOptions({ gfm: true, breaks: false });

function extractTitle(md) {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : 'Untitled';
}

function build() {
  const md = readFileSync(INPUT, 'utf8');
  const template = readFileSync(TEMPLATE, 'utf8');

  const title = extractTitle(md);
  // Strip the leading H1 so it doesn't render twice (header already shows it).
  const body = md.replace(/^#\s+.+?\s*\n/, '');
  const content = marked.parse(body).trim();

  const now = new Date();
  const meta = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const html = template
    .replaceAll('{{title}}', escapeHtml(title))
    .replace('{{eyebrow}}', 'Document')
    .replace('{{meta}}', meta)
    .replace('{{content}}', content)
    .replace('{{generated}}', now.toISOString().slice(0, 10));

  writeFileSync(OUTPUT, html);
  console.log(`✓ Built ${OUTPUT} (${(html.length / 1024).toFixed(1)} KB)`);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

build();

if (process.argv.includes('--watch')) {
  console.log('Watching input.md and template.html for changes...');
  for (const f of [INPUT, TEMPLATE]) {
    watch(f, { persistent: true }, () => {
      try { build(); } catch (e) { console.error('Build failed:', e.message); }
    });
  }
}
