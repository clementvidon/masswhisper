# Public API Surface

> Status: shared-platform design document.
> This document defines the target public API surface of Shared Platform.
> It is not the operational source of truth for the current dedicated deployment path.
> For the dedicated runtime and deployment workflow, use `docs/ops/runtime-model.md` and `docs/runbooks/`.

This document defines the public HTTP surface of Shared Platform.

Its purpose is to freeze what is publicly reachable, what stays private, and where the MVP intentionally draws the line.

It does not describe Dedicated Deployment.

## Goal

The public API surface must stay:

- narrow
- read-only
- easy to explain
- compatible with browser access from the frontend
- small enough to defend operationally

## Public Entry Points

The only intended public entry points are:

- frontend origin: `https://masswhisper.com`
- API origin: `https://api.masswhisper.com`

The frontend is public product surface.
The API is public data surface.

## Public API Contract

The intended public read contract is:

- `GET /api/v1/topics/<topic-slug>/daily`
- `GET /api/v1/topics/<topic-slug>/status`
- `GET /health`

Rules:

- these endpoints are publicly reachable
- they are read-only
- they are callable by the browser
- they must remain versioned under `/api/v1/...`, except `/health`

## Non-Public Surface

The following must not be publicly reachable:

- the Node backend listener itself, such as `127.0.0.1:3000`
- any write endpoint
- any admin endpoint
- any public capture trigger
- direct database access
- any private runtime or deployment endpoint

## Reverse Proxy Boundary

Public traffic reaches `Nginx`, not the Node process directly.

Rules:

- `Nginx` is the public HTTP boundary
- Node listens only on a local interface behind the proxy
- the proxy forwards only the intended public API surface
- the proxy does not become the source of truth for business access rules

## Topic Resolution Policy

Topic exposure remains explicit and bounded.

Rules:

- reserved slugs must never resolve to a topic
- a non-reserved but unconfigured slug returns API `404`
- the frontend may turn that API `404` into an application-level 404 page

## CORS Boundary

CORS exists to allow the intended frontend origin to call the API from the browser.

Rules:

- the normal allowed frontend origin is `https://masswhisper.com`
- a temporary Vercel frontend origin may be allowed during cutover
- temporary origins must be removed after cutover
- CORS is not an authentication or confidentiality mechanism

## Runtime And Health Surface

The public surface includes only minimal runtime visibility:

- `/health` for runtime health
- `/status` for topic execution status

Rules:

- `/health` reports service/runtime health
- `/status` reports last known topic execution state
- `pipeline_runs` is internal storage or read-side backing, not a public endpoint by itself

## Implementation Boundary

This document freezes the intended public contract of the shared platform design.

Current backend, proxy, and frontend code do not implement this contract end to end yet.
Treat this document as target design until the cutover from static runtime is actually completed.
