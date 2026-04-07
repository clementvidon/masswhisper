# Cross-Workspace Documentation

## Documentation structure

- `docs/architecture/` → system design, data flows, boundaries, and cross-workspace decisions
- `docs/ops/` → runtime model, deployment assumptions, DNS/TLS, and cutover decisions
- `docs/security/` → public exposure, API surface, and security posture
- `docs/frontend/` → frontend public routing, hosting, and browser-visible behavior
- `docs/convention/` → formats, naming, style, and documentation standards
- `docs/workflow/` → development processes and workflows
- `docs/runbooks/` → operations, incidents, maintenance

## Reading order

For the current dedicated deployment path, prefer:

- `docs/runbooks/` for operational procedures
- `docs/ops/runtime-model.md` for the active runtime model

Notes:

- some documents in `docs/architecture/`, `docs/frontend/`, and `docs/security/` describe the shared-platform target design or the static-to-dedicated transition
- those documents remain useful for design context, but they are not the primary source of truth for the current dedicated deployment workflow
