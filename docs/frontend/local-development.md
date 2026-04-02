# Frontend Local Development

This runbook explains how to run and validate the frontend locally.

It covers two workflows:

- static mode: frontend reads `daily.json`
- dedicated mode: frontend reads the local backend API

Estimated hands-on time: 5 to 10 minutes

## Prerequisites

- Node.js >= 22
- dependencies installed with `npm install`
- optional: `backend/.env` copied from `backend/.env.example`

## 1. Install Dependencies

```zsh
npm install
```

## 2. Static Frontend Workflow

Use this mode when you want to validate UI changes against a generated snapshot.

Generate the local bundle:

npm run generate-static

Start the frontend:

```zsh
npm --workspace frontend run dev:static
```

Open the app at:

http://localhost:5173/masswhisper/

Notes:

- this mode reads frontend/public/daily.json
- if daily.json is missing or stale, regenerate it before testing

## 3. Dedicated Frontend Workflow

Use this mode when you want the frontend to call the local read API.

Start the backend read API:

```zsh
npm --workspace backend run dev
```

Start the frontend in dedicated mode:

```zsh
VITE_API_BASE_URL=http://127.0.0.1:3000 VITE_TOPIC_NAME="MassWhisper" npm --workspace frontend run dev:dedicat
```

Open the app at:

http://localhost:5173/

Useful local endpoints:

- http://127.0.0.1:3000/health
- http://127.0.0.1:3000/daily

## 4. Validate Frontend Changes

Run automated checks:

```zsh
npm --workspace frontend run check
```

## 5. Common Pitfalls

- npm run generate-static requires a valid backend environment and data source access
- static mode serves under /masswhisper/, not /
- dedicated mode requires VITE_API_BASE_URL
- backend local API expects READ_API_DAILY_BUNDLE_PATH to point to a readable bundle

## State After This Runbook

- the frontend runs locally in static mode
- the frontend can also run locally against the backend read API
- UI changes can be validated before running broader repository checks
