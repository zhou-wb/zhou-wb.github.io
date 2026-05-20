# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Jekyll-based academic portfolio website using the **al-folio** theme, personalized for Wenbin Zhou. It is deployed to GitHub Pages at https://zhou-wb.github.io.

## Common Commands

```bash
# Local development
bundle exec jekyll serve          # Dev server at localhost:4000
bundle exec jekyll build          # Build to _site/

# Production build (with CSS purification)
JEKYLL_ENV=production bundle exec jekyll build
purgecss -c purgecss.config.js   # Run after production build

# Deploy to gh-pages branch
bin/deploy -s main -d gh-pages

# Docker alternative
docker-compose up
```

## Architecture

### Content Collections
- `_news/` — News items shown on homepage with client-side pagination (`assets/js/news_pagination.js`)
- `_projects/` — Project cards with category filtering
- `_bibliography/` — BibTeX files; publications page is auto-generated from these
- `_data/cv.yml` — Structured CV data rendered by `_layouts/cv.liquid`
- `_posts/` — Blog posts

### Key Configuration
- `_config.yml` — Main Jekyll config: site metadata, plugin settings, CDN library versions with SRI hashes, collection limits
- `Gemfile` — Ruby/Jekyll dependencies
- `package.json` — Node dev deps (Prettier + Liquid plugin for formatting)

### Layout System
- `_layouts/` — Page-type layouts: `about.liquid`, `bib.liquid`, `cv.liquid`, `post.liquid`, `distill.liquid`
- `_includes/` — Reusable components for CV sections, repository cards, bibliography rendering
- `_sass/` — SCSS source (themes, font-awesome, tabler-icons)

### Custom Plugins (`_plugins/`)
- `google-scholar-citations.rb` — Fetches citation counts from Google Scholar
- `inspirehep-citations.rb` — Fetches metrics from Inspire HEP
- `details.rb` — Custom `{% details %}` Liquid tag
- `hide-custom-bibtex.rb` — Filters BibTeX fields from output
- `cache-bust.rb` — Appends content hashes to asset URLs

### Deployment
GitHub Actions (`.github/workflows/deploy.yml`) builds on push to main using Python 3.13 + Ruby 3.3.5, runs purgecss, then deploys via `JamesIves/github-pages-deploy-action` to the `gh-pages` branch.

## Adding Content

- **News item**: Add a Markdown file to `_news/` with YAML front matter
- **Publication**: Add a BibTeX entry to the appropriate file in `_bibliography/`
- **Project**: Add a Markdown file to `_projects/`
- **Blog post**: Add a Markdown file to `_posts/` following the `YYYY-MM-DD-title.md` naming convention
