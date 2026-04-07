# Dedicated Deployment Model

This document defines the dedicated deployment model.

## Runtime Principles

The runtime must stay:

- simple to operate
- reproducible with IaC
- minimal in public exposure
- clear in component boundaries

## Process Model

- one long-lived backend service runs for the deployment
- `Nginx` stays the only public HTTP entrypoint on the VM
- the Node backend stays private behind the proxy
- `cron` runs alongside the backend service and triggers capture through a single entrypoint

## Runtime Shape

The runtime is intentionally simple:

- the public frontend is hosted on its public domain such as `<domain>`
- the public API is exposed on its public API domain such as `api.<domain>`
- `Nginx` is the public reverse proxy on the backend VM
- the Node backend listens only on a local interface behind `Nginx`
- one backend runtime serves one real deployed topic
- capture runs are triggered locally through `cron`, a single capture entrypoint, and `flock`
- each production topic uses its own Neon database

## Component Responsibilities

### Vercel

- serves the frontend SPA
- handles public frontend hosting
- serves the frontend domain of the deployment

### Nginx

- exposes the public API entrypoint
- terminates TLS
- redirects HTTP to HTTPS
- forwards requests to the local Node backend
- applies generic proxy concerns such as timeouts and forwarding headers

### Node backend

- serves the read-only API
- applies application configuration
- applies CORS from environment-driven configuration
- cron publishes an atomically swapped daily bundle on local disk
- Node backend exposes GET /daily by reading the current published bundle from local disk
- exposes runtime health endpoints

### cron + capture entrypoint + flock

- schedules capture execution locally on the backend VM
- ensures a single entrypoint for capture orchestration
- prevents overlapping runs

### Neon

- stores the production data for the topic
- remains external to the VM runtime

## Network Model

The network model is deliberately narrow:

- the frontend is public on its frontend domain
- the API is public on its API domain
- the Node backend is not publicly reachable
- the backend listens only on a local interface such as `127.0.0.1`
- the initial fixed backend listener target is `127.0.0.1:3000`
- TLS is terminated at `Nginx`

Example request flow:

```text
Browser
  -> https://api.<domain>
  -> Nginx on public 80/443
  -> proxy_pass http://127.0.0.1:3000
  -> Node backend
```

## Public And Temporary Entry Points

Normal public entrypoints:

- frontend: `https://<domain>`
- API: `https://api.<domain>`

## DNS And Cutover Assumptions

- the target frontend domain is deployment-specific
- the target API domain is deployment-specific
- Vercel is the intended serving target for the frontend domain
- the backend VM is the intended traffic target for the API domain
- DNS TTL may be lowered before cutover to reduce propagation delay

## CORS Model

CORS is controlled by application configuration, not by handwritten proxy rules.

Rules:

- the source of truth is an allowlist of origins injected through environment variables
- the backend applies the CORS policy
- the proxy does not duplicate a separate business-level allowlist

Normal target origin:

- `https://<domain>`

Temporary fallback origins may be allowed during cutover and must be removed afterward.

## Scheduler Model

Scheduling remains intentionally local in this deployment model.

Rules:

- `cron` triggers execution on the VM
- one capture entrypoint orchestrates the run
- `flock` prevents overlap
- if the lock is already held, the runtime logs `capture skipped: lock held`
- if the lock is already held, the run exits cleanly
- a skipped run must not create a fake `pipeline_run`

## Secrets Injection Model

Secrets are injected into the backend runtime through environment variables or private runtime files outside git.

The manifest may reference secrets, but it does not store secret values.

The runtime model assumes:

- secrets stay outside git
- scripts or deployment steps inject secret values and private prompt and sources bundles into the runtime
- local operator copies of those bundles may be referenced by environment-driven paths before installation
- the backend reads them at process start

## Runtime Observability

- `/health` reports runtime/service health
- backend runtime logs are kept for investigation
- proxy access logs remain available at the HTTP entrypoint
- `pipeline_runs` tracks execution history and must not be confused with raw HTTP health
