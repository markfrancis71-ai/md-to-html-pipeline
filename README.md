# md-to-html-pipeline

Minimal Node.js pipeline that converts a Markdown file into styled HTML matching the Daily Brief design (navy/teal dark theme, Inter font, card-based layout). Output is published to GitHub Pages.

## Usage

```bash
npm install
npm run build           # one-shot build
npm run build:watch     # rebuild on input.md / template.html change
```

Edit `input.md` and re-run `npm run build`. The first H1 becomes the page title; the rest of the document renders inside a styled card.

## Files

- `build.js` — reads `input.md`, parses with [marked](https://marked.js.org/), injects into `template.html`, writes `index.html`.
- `template.html` — HTML shell with `{{title}}`, `{{eyebrow}}`, `{{meta}}`, `{{content}}`, `{{generated}}` placeholders.
- `styles.css` — Daily Brief dark theme adapted for prose (headings, lists, code blocks, blockquotes, tables).
- `input.md` — your source markdown.
- `index.html` — generated output (committed so GitHub Pages can serve it).
