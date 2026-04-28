import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync, watch } from 'node:fs';
import { resolve, dirname, basename, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));

const INPUT_DIR    = resolve(__dirname, 'input');
const DIST_DIR     = resolve(__dirname, 'dist');
const TEMPLATE     = resolve(__dirname, 'template.html');
const INDEX_TPL    = resolve(__dirname, 'index-template.html');
const STYLES       = resolve(__dirname, 'styles.css');

const SITE_TITLE   = 'Daily Brief Library';
const SITE_EYEBROW = 'Index';

marked.setOptions({ gfm: true, breaks: false });

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractFirstH1(md) {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function extractFirstParagraph(md) {
  const stripped = md.replace(/^#\s+.+?\s*\n/, '').trim();
  const para = stripped.split(/\n\s*\n/, 1)[0] || '';
  return para.replace(/\s+/g, ' ').trim();
}

function formatLongDate(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  });
}

function loadDoc(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { data: fm, content: body } = matter(raw);
  const fileStat = statSync(filePath);

  const title    = fm.title   || extractFirstH1(body) || basename(filePath, '.md');
  const eyebrow  = fm.eyebrow || 'Document';
  const meta     = fm.meta    || formatLongDate(new Date());
  const summary  = fm.summary || extractFirstParagraph(body);
  const date     = fm.date ? new Date(fm.date) : fileStat.mtime;

  // Strip leading H1 if it duplicates the front-matter title.
  const bodyMd = body.replace(/^#\s+.+?\s*\n/, '');
  const html = marked.parse(bodyMd).trim();

  const slug = slugify(basename(filePath, '.md'));
  return { slug, title, eyebrow, meta, summary, date, html };
}

function renderPage(doc, template, generatedDate) {
  return template
    .replaceAll('{{title}}',     escapeHtml(doc.title))
    .replace('{{eyebrow}}',      escapeHtml(doc.eyebrow))
    .replace('{{meta}}',         escapeHtml(doc.meta))
    .replace('{{content}}',      doc.html)
    .replace('{{generated}}',    generatedDate);
}

function renderIndex(docs, template, generatedDate) {
  const entries = docs.map(d => `
        <a class="doc-entry" href="${escapeHtml(d.slug)}.html">
          <div class="doc-entry-eyebrow">${escapeHtml(d.eyebrow)}</div>
          <div class="doc-entry-title">${escapeHtml(d.title)}</div>
          <div class="doc-entry-summary">${escapeHtml(d.summary || '')}</div>
          <div class="doc-entry-meta">${escapeHtml(formatLongDate(d.date))}</div>
        </a>`).join('\n');

  return template
    .replaceAll('{{site_title}}', escapeHtml(SITE_TITLE))
    .replace('{{eyebrow}}',       escapeHtml(SITE_EYEBROW))
    .replace('{{meta}}',          `${docs.length} document${docs.length === 1 ? '' : 's'} · updated ${generatedDate}`)
    .replace('{{entries}}',       entries)
    .replace('{{generated}}',     generatedDate);
}

function build() {
  rmSync(DIST_DIR, { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });

  const template  = readFileSync(TEMPLATE,  'utf8');
  const indexTpl  = readFileSync(INDEX_TPL, 'utf8');
  const generated = new Date().toISOString().slice(0, 10);

  const files = readdirSync(INPUT_DIR)
    .filter(f => extname(f).toLowerCase() === '.md')
    .map(f => join(INPUT_DIR, f));

  if (files.length === 0) {
    console.warn('No .md files found in input/.');
    return;
  }

  const docs = files.map(loadDoc).sort((a, b) => b.date - a.date);

  for (const doc of docs) {
    const html = renderPage(doc, template, generated);
    writeFileSync(join(DIST_DIR, `${doc.slug}.html`), html);
  }

  writeFileSync(join(DIST_DIR, 'index.html'), renderIndex(docs, indexTpl, generated));
  copyFileSync(STYLES, join(DIST_DIR, 'styles.css'));

  console.log(`✓ Built ${docs.length} page${docs.length === 1 ? '' : 's'} + index → dist/`);
  for (const d of docs) console.log(`  · ${d.slug}.html  (${d.title})`);
}

build();

if (process.argv.includes('--watch')) {
  console.log('Watching input/, template.html, index-template.html, styles.css...');
  const targets = [INPUT_DIR, TEMPLATE, INDEX_TPL, STYLES];
  for (const t of targets) {
    watch(t, { persistent: true, recursive: t === INPUT_DIR }, () => {
      try { build(); } catch (e) { console.error('Build failed:', e.message); }
    });
  }
}
