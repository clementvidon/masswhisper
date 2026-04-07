# Deploy Scripts

Deployment scripts for the client-server path.

## Entry points

- `deploy-topic.sh` → orchestrate a topic deployment flow
- `update-backend.sh` → update backend code and runtime artifacts on the VM
- `verify-backend.sh` → verify backend health and API reachability
- `verify-frontend.sh` → verify frontend deployment and API wiring

## Runbook-aligned scripts

- `01-bootstrap-vm.sh`
- `02-post-boot-backend.sh`
- `03-enable-tls.sh`
- `04-deploy-frontend.sh`

These scripts support the deployment runbooks in `docs/runbooks/`.

`common.sh` contains shared shell helpers and is not meant to be executed directly.
