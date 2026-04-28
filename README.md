# md-to-html-pipeline

Multi-page Markdown → styled HTML pipeline. Drop `.md` files in `input/`, run a build, and a GitHub Action publishes the rendered site to GitHub Pages with the **Daily Brief** dark theme (navy/teal/Inter, card-based layout).

🌐 **Live:** https://markfrancis71-ai.github.io/md-to-html-pipeline/

## Add a new page

1. Create `input/<name>.md`.
2. (Optional) add YAML front-matter:
   ```yaml
   ---
   title: My Page Title
   eyebrow: Documentation
   meta: April 2026 · v2
   date: 2026-04-27
   summary: One-line description used on the index page.
   ---
   ```
3. Commit and push to `main`. The Action builds and deploys automatically — no generated files in git.

If you skip front-matter, the first `# Heading` becomes the title, today's date fills the meta, and the first paragraph becomes the index summary.

## Front-matter fields

| Field   | Purpose                                | Default                |
|---------|----------------------------------------|------------------------|
| title   | Page title (header H1 and `<title>`)   | First H1 in the file   |
| eyebrow | Small uppercase label above the title  | `Document`             |
| meta    | Subtitle line below the title          | Today's date           |
| date    | Used to sort entries on the index page | File mtime             |
| summary | One-line description on the index page | First paragraph        |

## Local development

```bash
npm install
npm run build           # input/*.md -> dist/*.html + dist/index.html
npm run build:watch     # rebuild on input/ or template change
npm run clean           # delete dist/
```

Open `dist/index.html` in a browser to preview before pushing.

## Project layout

| Path                       | Role                                                                   |
|----------------------------|------------------------------------------------------------------------|
| `input/`                   | Source markdown files (front-matter optional).                         |
| `build.js`                 | Reads `input/*.md`, renders via marked + front-matter, writes `dist/`. |
| `template.html`            | Per-page HTML shell with `{{title}}` / `{{content}}` placeholders.     |
| `index-template.html`      | Index page shell listing all documents.                                |
| `styles.css`               | Daily Brief theme (copied verbatim into `dist/` on build).             |
| `dist/`                    | Build output. Git-ignored. Generated and uploaded by the Action.       |
| `.github/workflows/deploy.yml` | CI: builds and deploys to Pages on every push to `main`.           |

## Deployment

GitHub Pages is configured to use **GitHub Actions** as its source (not a branch). The `deploy.yml` workflow:

1. Checks out the repo
2. Installs deps with `npm ci`
3. Runs `npm run build`
4. Uploads `dist/` as a Pages artifact
5. Deploys it

You can also trigger it manually via the **Actions** tab → *Build and deploy to Pages* → *Run workflow*.
