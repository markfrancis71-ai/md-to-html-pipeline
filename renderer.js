import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));

marked.setOptions({ gfm: true, breaks: false });

export const PATHS = {
  template:      resolve(__dirname, 'template.html'),
  indexTemplate: resolve(__dirname, 'index-template.html'),
  styles:        resolve(__dirname, 'styles.css'),
  input:         resolve(__dirname, 'input'),
  dist:          resolve(__dirname, 'dist'),
};

export function slugify(name) {
  return String(name).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'document';
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatLongDate(d) {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'UTC',
  });
}

function extractFirstH1(md) {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : null;
}

function extractFirstParagraph(md) {
  const stripped = md.replace(/^#\s+.+?\s*\n/, '').trim();
  return (stripped.split(/\n\s*\n/, 1)[0] || '').replace(/\s+/g, ' ').trim();
}

export function parseDoc(rawMarkdown, opts = {}) {
  const { fallbackSlug = 'document', mtime = new Date() } = opts;
  const { data: fm, content: body } = matter(rawMarkdown);

  const title    = fm.title   || extractFirstH1(body) || fallbackSlug;
  const eyebrow  = fm.eyebrow || 'Document';
  const meta     = fm.meta    || formatLongDate(new Date());
  const summary  = fm.summary || extractFirstParagraph(body);
  const date     = fm.date ? new Date(fm.date) : mtime;
  const bodyMd   = body.replace(/^#\s+.+?\s*\n/, '');
  const html     = marked.parse(bodyMd).trim();
  const slug     = slugify(fallbackSlug);

  return { slug, title, eyebrow, meta, summary, date, html, fm };
}

export function renderPage(doc, { template, generated }) {
  return template
    .replaceAll('{{title}}',  escapeHtml(doc.title))
    .replace('{{eyebrow}}',   escapeHtml(doc.eyebrow))
    .replace('{{meta}}',      escapeHtml(doc.meta))
    .replace('{{content}}',   doc.html)
    .replace('{{generated}}', generated);
}

export function renderIndex(docs, { template, generated, siteTitle = 'Markdown to HTML Library', siteEyebrow = 'Index' }) {
  const entries = docs.map(d => `
        <a class="doc-entry" href="${escapeHtml(d.slug)}.html">
          <div class="doc-entry-eyebrow">${escapeHtml(d.eyebrow)}</div>
          <div class="doc-entry-title">${escapeHtml(d.title)}</div>
          <div class="doc-entry-summary">${escapeHtml(d.summary || '')}</div>
          <div class="doc-entry-meta">${escapeHtml(formatLongDate(d.date))}</div>
        </a>`).join('\n');

  return template
    .replaceAll('{{site_title}}', escapeHtml(siteTitle))
    .replace('{{eyebrow}}',       escapeHtml(siteEyebrow))
    .replace('{{meta}}',          `${docs.length} document${docs.length === 1 ? '' : 's'} · updated ${generated}`)
    .replace('{{entries}}',       entries)
    .replace('{{generated}}',     generated);
}
