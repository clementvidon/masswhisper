# 04 - Dedicated Frontend Deployment Runbook

This runbook deploys the dedicated mono-topic frontend on `https://<domain>` and wires it to the dedicated backend on `https://api.<domain>`.

Estimated hands-on time: 10 minutes

It assumes:

- the dedicated backend post-boot runbook is completed
- the dedicated API DNS and TLS runbook is completed
- the operator controls the DNS zone of `<domain>`
- the instance manifest already exists
- the Vercel project is available to the operator account

Operator variables:

```zsh
export TOPIC_SLUG=fr-dev-job-market
export ENVIRONMENT=prod
```

## 1. Read The Instance Source Of Truth

Read `domain` and `topic_name` from the instance manifest, then derive `public_api_domain`.

```zsh
domain="$(sed -n 's/^domain: //p' instances/$TOPIC_SLUG/$ENVIRONMENT.yaml)"
topic_name="$(sed -n 's/^topic_name: //p' instances/$TOPIC_SLUG/$ENVIRONMENT.yaml)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

printf "domain: %s\n" "$domain"
printf "topic_name: %s\n" "$topic_name"
printf "public_api_domain: %s\n" "$public_api_domain"
```

## 2. Verify The Dedicated API Is Ready

```zsh
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

printf "public api health reachable: "
curl -s -i "https://$public_api_domain/health" \
  | grep -Eq "^HTTP/[0-9.]+ 200" && echo ok || echo fail
```

## 3. Create Or Configure The Vercel Project

Create or open the Vercel project for the dedicated frontend.

If creating a new project:

1. Click "Import Project" in Vercel
2. Select the repository containing the `frontend/` directory

Before deploying, configure the project:

- Framework preset: `Vite`
- Root directory: `.`
- Build command: `npm run build-shared && npm run build:dedicated --workspace=frontend`
- Output directory: `frontend/dist`

## 4. Set Dedicated Frontend Build Variables

Set the following variables in the Vercel production environment:

- `VITE_API_BASE_URL=https://api.<domain>`
- `VITE_TOPIC_NAME=<topic_name>`

Mirror them in preview environments if needed.

## 5. Prepare The Frontend DNS Record

Create the DNS record required by Vercel for the dedicated frontend domain.

1. Add the `domain` in Vercel:

- Go to: Settings → Domains
- Click: Add Existing
- Enter: `<domain>`

Once added, click "Learn more" and copy the "Value" provided by Vercel.

This value will be used as the DNS target in the next step.

2. Create a `CNAME` record using the value provided by Vercel:

- Type: `CNAME`
- Host: `<subdomain>` (not the full domain)
- Target: `<value>` (from Vercel)
- TTL: `300` (or default)

3. Verify in Vercel

- Go back to: Settings → Domains
- Click: Refresh

Ensure:

- the frontend domain is `https://<domain>`
- the DNS record matches the exact type and value required by Vercel
- `<domain>` is never pointed to the backend VM
- `api.<domain>` remains reserved for the backend VM
- no `A` record exists for the same host as the `CNAME`

## 6. Verify The Dedicated Frontend Domain

In Vercel (Settings → Domains), ensure:

- the domain is attached to the Production environment
- the domain status is "Valid Configuration"
- the production URL is `https://<domain>`
- `api.<domain>` remains reserved for the backend VM

## 7. Trigger A Production Redeploy

Trigger a new production deployment in Vercel.

- Go to: Deployments
- Open the latest deployment menu (`...`)
- Click: Redeploy

Ensure the new deployment reaches the `Ready` state before continuing.

## 8. Verify The Dedicated Frontend

Verify:

- frontend loads on `https://<domain>`
- browser fetches `https://api.<domain>/report`
- browser fetches `https://api.<domain>/headlines`
- browser fetches `https://api.<domain>/sentiment-history`
- no request targets `report.json`, `ticker.json`, or `chart.json`

Use the browser network inspector to confirm the runtime requests.

## State After This Runbook

- the dedicated frontend is reachable on `https://<domain>`
- the dedicated frontend fetches data from `https://api.<domain>`
- no runtime request targets `report.json`, `ticker.json`, or `chart.json`
