![CI](https://github.com/clementvidon/masswhisper/actions/workflows/ci.yml/badge.svg)
![Coverage](https://codecov.io/gh/clementvidon/masswhisper/branch/main/graph/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![TypeScript](https://img.shields.io/badge/TypeScript-✓-blue)
![Last commit](https://img.shields.io/github/last-commit/clementvidon/masswhisper)

# MassWhisper

The dev job market barometer — powered by Reddit sentiment.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Automation](#automation)
4. [Contributing](#contributing)
5. [License](#license)

---

## Overview

MassWhisper tracks the French developer job market’s mood from Reddit activity. Posts are ingested, filtered, and scored to produce a daily sentiment report, published to GitHub Pages.

## Quick Start

### Requirements

- Node.js >= 22 (see `package.json#engines`).
- OpenAI API key with billing enabled (for backend analysis).

### Setup

```bash
git clone https://github.com/clementvidon/masswhisper.git
cd masswhisper
npm install

# Backend env
cp backend/.env.example backend/.env
# edit backend/.env and set OPENAI_API_KEY=sk-...
```

### Run locally

- Backend API (Express): `npm --workspace backend run dev` then POST `http://localhost:3000/report` to update.
- Frontend static mode: `npm --workspace frontend run dev:static`
- Frontend dedicated mode: `npm --workspace frontend run dev:dedicated`

### Useful scripts

- Project checks: `npm run check` (format:check, lint, type-check, test across workspaces).
- Tests: `npm run test` or `npm run test:coverage` (root) — or per workspace via `npm --workspace <pkg> run test`.

## Automation

Daily GitHub Actions build and publish the static site. Maintainers can trigger a full update locally:

```bash
npm run generate-static   # backend: produce JSON snapshot
npm run update-site       # build frontend and deploy to GitHub Pages
```

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run check` before pushing. See `docs/git_workflow.md` for the suggested branching/PR process.

---

## License

[MIT](LICENSE)

This project is open source and freely available under the MIT License.
You are free to use, modify, and distribute it with attribution.
