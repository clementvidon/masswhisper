# Static Deployment Model

This document defines the static deployment model.

## Deployment Principles

The deployment must stay:

- simple to publish
- low in operational overhead
- reproducible from generated artifacts
- narrow in public exposure

## Process Model

- the backend pipeline runs outside the public serving path
- a generated daily bundle is published as a static artifact
- the frontend reads the published bundle directly
- no public application server is required for runtime reads

## Runtime Shape

The deployment is intentionally simple:

- the public frontend is served as a static site
- the published data is exposed as `daily.json`
- the browser reads `daily.json` from the frontend origin
- backend execution happens before publication, not during public reads
- each publication replaces the previously served bundle

## Component Responsibilities

### Static host

- serves the frontend assets
- serves `daily.json`
- handles public HTTP delivery of the static site

### Backend generation flow

- fetches source material
- runs the analysis pipeline
- produces the daily bundle consumed by the frontend
- publishes the generated artifact set

### Browser frontend

- loads the static frontend assets
- fetches `daily.json` from the frontend origin
- renders the published snapshot without calling a backend API

## Network Model

The network model is intentionally narrow:

- the frontend is publicly reachable
- `daily.json` is publicly reachable from the same origin
- no public backend API is required
- no reverse proxy or private application listener is required for reads

Example request flow:

```text
Browser
  -> https://<frontend-origin>
  -> static host
  -> /daily.json
```

## Publication Model

Publication is artifact-based.

Rules:

- the backend generates the daily bundle before publication
- the published site serves the latest generated bundle
- public reads do not trigger capture or analysis
- runtime freshness depends on the publication schedule

## Secrets Model

Secrets stay outside the public runtime.

Rules:

- secrets are used only during generation and publication
- secret values are not required by the browser runtime
- published static artifacts must not contain private credentials

## Runtime Observability

- publication success is verified through build and deploy outcomes
- frontend runtime failures are visible through browser and hosting diagnostics
- there is no public application health endpoint in this model
