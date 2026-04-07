# Public HTTP Surface

This document defines the public HTTP surface of the deployment models supported by MassWhisper.

Its purpose is to make public exposure explicit across deployment models.

## Design Goals

The public surface must stay:

- narrow
- read-only
- easy to explain
- small enough to defend operationally
- compatible with browser access where required

## Model Status

- `static` → supported legacy deployment model
- `dedicated` → current client-server deployment model
- `shared` → planned deployment model, not implemented yet

## Static

The static model exposes only static frontend assets and published data artifacts.

Publicly reachable surface:

- frontend origin
- static assets
- `daily.json`

Rules:

- browser reads come from the frontend origin
- no public application server is required
- no write or admin surface is exposed publicly
- runtime data is served as a published static artifact

## Dedicated

The dedicated model exposes one frontend origin and one public API origin per deployment.

Publicly reachable surface:

- frontend origin: `https://<domain>`
- API origin: `https://api.<domain>`
- `GET /daily`
- `GET /status`
- `GET /health`

Rules:

- the API is read-only
- public traffic reaches `Nginx`, not the Node process directly
- the Node backend listens only on a local interface behind the proxy
- no write endpoint, admin endpoint, or public capture trigger is exposed
- direct database access is never public
- CORS allows only the intended frontend origin

## Shared

The shared model exposes one shared frontend origin and one shared API origin across topics.

Publicly reachable surface:

- frontend origin: `https://masswhisper.com`
- API origin: `https://api.masswhisper.com`
- `GET /api/v1/topics/<topic-slug>/daily`
- `GET /api/v1/topics/<topic-slug>/status`
- `GET /health`

Rules:

- the API is read-only
- routes stay versioned under `/api/v1/...`, except `/health`
- topic exposure remains explicit and bounded by topic configuration
- reserved slugs must never resolve to a topic
- public traffic reaches the reverse proxy boundary, not the Node process directly
- no write endpoint, admin endpoint, or public capture trigger is exposed
- direct database access is never public
- CORS allows only intended frontend origins

## Non-Public Surface

The following must never be publicly reachable in client-server models:

- the local Node listener, such as `127.0.0.1:3000`
- any write endpoint
- any admin endpoint
- any public capture trigger
- direct database access
- private runtime or deployment endpoints

## Health And Runtime Visibility

Public runtime visibility stays minimal.

Rules:

- `/health` reports service/runtime health where the model exposes a backend API
- `/status` reports runtime or topic execution state where supported
- internal execution history is not a public API by itself
