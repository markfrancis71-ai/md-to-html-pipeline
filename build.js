import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, copyFileSync, rmSync, watch } from 'node:fs';
import { resolve, basename, join, extname } from 'node:path';
import { PATHS, parseDoc, renderPage, renderIndex } from './renderer.js';

function loadDocFromFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const stat = statSync(filePath);
  const slug = basename(filePath, extname(filePath));
  return parseDoc(raw, { fallbackSlug: slug, mtime: stat.mtime });
}

function build() {
  rmSync(PATHS.dist, { recursive: true, force: true });
  mkdirSync(PATHS.dist, { recursive: true });

  const template  = readFileSync(PATHS.template,      'utf8');
  const indexTpl  = readFileSync(PATHS.indexTemplate, 'utf8');
  const generated = new Date().toISOString().slice(0, 10);

  const files = readdirSync(PATHS.input)
    .filter(f => extname(f).toLowerCase() === '.md')
    .map(f => join(PATHS.input, f));

  if (files.length === 0) {
    console.warn('No .md files found in input/.');
    return;
  }

  const docs = files.map(loadDocFromFile).sort((a, b) => b.date - a.date);

  for (const doc of docs) {
    writeFileSync(join(PATHS.dist, `${doc.slug}.html`), renderPage(doc, { template, generated }));
  }
  writeFileSync(join(PATHS.dist, 'index.html'), renderIndex(docs, { template: indexTpl, generated }));
  copyFileSync(PATHS.styles, join(PATHS.dist, 'styles.css'));

  console.log(`✓ Built ${docs.length} page${docs.length === 1 ? '' : 's'} + index → dist/`);
  for (const d of docs) console.log(`  · ${d.slug}.html  (${d.title})`);
}

build();

if (process.argv.includes('--watch')) {
  console.log('Watching input/, template.html, index-template.html, styles.css...');
  const targets = [PATHS.input, PATHS.template, PATHS.indexTemplate, PATHS.styles];
  for (const t of targets) {
    watch(t, { persistent: true, recursive: t === PATHS.input }, () => {
      try { build(); } catch (e) { console.error('Build failed:', e.message); }
    });
  }
}
