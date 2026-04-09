![CI](https://github.com/clementvidon/masswhisper/actions/workflows/ci.yml/badge.svg)
![Coverage](https://codecov.io/gh/clementvidon/masswhisper/branch/main/graph/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![TypeScript](https://img.shields.io/badge/TypeScript-✓-blue)
![Last commit](https://img.shields.io/github/last-commit/clementvidon/masswhisper)

# masswhisper

A monitoring system for qualitative signals.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Automation](#automation)
4. [Contributing](#contributing)
5. [License](#license)

---

## Overview

Masswhisper generates topic-specific eight-emotion timelines from public online discourse.

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

- Generate a local daily bundle: `npm run generate-daily-bundle`
- Backend read API (Express): `npm --workspace backend run dev` then GET `http://localhost:3000/daily`
- Frontend in static mode: `npm --workspace frontend run dev:static`
- Frontend in client-server mode: `npm --workspace frontend run dev:dedicated`

For frontend local development details, see `docs/frontend/local-development.md`.

### Useful scripts

- Project checks: `npm run check` (format:check, lint, type-check, test across workspaces).
- Tests: `npm run test` or `npm run test:coverage` (root) — or per workspace via `npm --workspace <pkg> run test`.

## Automation

Masswhisper currently supports two deployment models:

- Static publishing: daily GitHub Actions build and publish the static site.
- Dedicated client-server deployment: the operational setup is documented in the runbooks.

For static publishing, maintainers can trigger a full update locally:

```bash
npm run generate-daily-bundle # backend: produce JSON daily bundle
npm run update-site # build frontend and deploy to GitHub Pages
```

For deployment model details, see:

- `docs/ops/deployment-model.md`

For dedicated operational procedures, see:

- `docs/ops/deployment-model-dedicated.md`
- `docs/runbooks/README.md`

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run check` before pushing. See [docs/workflow/git_workflow.md](docs/workflow/git_workflow.md) for the suggested branching/PR process.

---

## License

[MIT](LICENSE)

This project is open source and freely available under the MIT License.
You are free to use, modify, and distribute it with attribution.
