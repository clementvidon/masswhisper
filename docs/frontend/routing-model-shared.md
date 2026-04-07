# Shared Routing Model

This document defines the frontend routing model of the shared deployment model.

## Goal

The routing model is chosen to stay:

- simple to explain
- path-based
- compatible with a SPA deployment
- compatible with a read-only backend API
- easy to deploy on Vercel
- easy to evolve across topics without one frontend build per topic

## Public Route Model

The public frontend route for a topic is:

- `https://masswhisper.com/<topic-slug>`

Rules:

- the first path segment is the topic slug
- the frontend reads the slug from the browser URL
- the frontend uses that slug to query the backend API
- the product contract is path-based, not subdomain-based

## SPA Fallback Model

The frontend is deployed as a single SPA on Vercel.

Rules:

- frontend routes are resolved by the SPA, not by static per-route files
- Vercel must fall back to `index.html` for public frontend routes
- direct navigation and browser refresh on `/<topic-slug>` must work
- the frontend application reads the URL after `index.html` is served

Example:

```text
GET https://masswhisper.com/fr-dev-job-market
-> Vercel returns index.html
-> the SPA starts in the browser
-> the SPA reads /fr-dev-job-market
-> topic_slug = fr-dev-job-market
```

## Unknown And Reserved Paths

Reserved slugs are never interpreted as topic slugs.

Rules:

- a reserved slug is treated as non-topic space
- a non-reserved but unconfigured slug still loads the SPA
- the frontend then calls the backend API for that slug
- if the backend returns `404`, the frontend shows an application-level 404 page
- a true frontend HTTP `404` would require frontend-side or edge-side knowledge of configured slugs, which remains out of scope for this design

## API Routing Contract

The frontend reads data from the shared API.

Rules:

- the frontend reads `topic_slug` from the URL
- the frontend calls `api.masswhisper.com/api/v1/topics/<topic-slug>/...`
- the API base URL is injected at build time through `VITE_API_BASE_URL`

## Frontend Origin

- `https://masswhisper.com`
