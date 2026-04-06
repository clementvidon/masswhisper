# 05 - Backend VM Update Runbook

This runbook updates the backend repository on an already provisioned VM and reapplies the required runtime artifacts depending on the modified files.

Estimated hands-on time: 2 minutes

It assumes:

- Ubuntu 24.04
- SSH access as `massops`
- passwordless sudo for `massops`
- the repository already exists at `/opt/masswhisper`
- the backend service is already installed on the VM

Operator variables:

```zsh
export PASS_SECRET_PATH=masswhisper/runtime/fr-dev-job-market-prod/backend.env
```

## 1. Choose The Update Path

Determine the path from modified files, not from commit intent.

Safe default:

- if unsure, run the `Dependencies` path
- then additionally apply `Systemd Unit` if `deploy/systemd/` changed
- then additionally apply `Nginx Proxy` if `deploy/proxy/` changed

Path rules:

- `runtime env` changes: reinstall `/etc/masswhisper/backend.env`, then restart the backend service
- `backend` code changes: restart the backend service
- `shared/` changes: rebuild shared artifacts, then restart the backend service
- `dependency` changes: reinstall dependencies, rebuild shared artifacts, then restart the backend service
- `deploy/systemd/` changes: reinstall the systemd unit, run daemon-reload, then restart the backend service
- `deploy/proxy/` changes: reinstall the active Nginx config, validate it, then reload Nginx

Use `dependency` when any of these changed:

- `package.json`
- `package-lock.json`
- `backend/package.json`
- `frontend/package.json`
- `shared/package.json`

## 2. Apply The Matching Update

### Runtime Env Files

Use this when `/etc/masswhisper/backend.env` or `/etc/masswhisper/topic-runtime.env` changed.

If `/etc/masswhisper/backend.env` changed:

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
: "${PASS_SECRET_PATH:?PASS_SECRET_PATH must be set}"
pass show "$PASS_SECRET_PATH" | \
  ssh "massops@$server_ip" '
    set -eu
    sudo install -d -m 755 /etc/masswhisper
    tmp=$(mktemp)
    trap "rm -f \"$tmp\"" EXIT
    cat > "$tmp"
    sudo install -o root -g masswhisper -m 640 "$tmp" /etc/masswhisper/backend.env
    sudo systemctl restart masswhisper-topic
'
```

If `/etc/masswhisper/topic-runtime.env` changed:

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
terraform -chdir=infra/terraform output -raw topic_runtime_env | \
  ssh "massops@$server_ip" '
    set -eu
    sudo install -d -m 755 /etc/masswhisper
    tmp=$(mktemp)
    trap "rm -f \"$tmp\"" EXIT
    cat > "$tmp"
    sudo install -o root -g masswhisper -m 640 "$tmp" /etc/masswhisper/topic-runtime.env
'
```

### Backend Code

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
  sudo systemctl restart masswhisper-topic
'
```

### Shared

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
  sudo -u masswhisper -H bash -lc "cd /opt/masswhisper && npm run build-shared"
  sudo systemctl restart masswhisper-topic
'
```

### Dependencies

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
  sudo -u masswhisper -H bash -lc "cd /opt/masswhisper && HUSKY=0 npm ci && npm run build-shared"
  sudo systemctl restart masswhisper-topic
'
```

### Systemd Unit

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
  sudo install -D -m 0644 /opt/masswhisper/deploy/systemd/masswhisper-topic.service \
    /etc/systemd/system/masswhisper-topic.service
  sudo systemctl daemon-reload
  sudo systemctl restart masswhisper-topic
'
```

### Nginx Proxy

Use this only if `/etc/masswhisper/public-api.tls.conf` is already up to date and only needs to be reinstalled as the active Nginx site configuration.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
  sudo install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
  sudo nginx -t
  sudo systemctl reload nginx
'
```

## Recover A Diverged Repository

Use this only if `git pull --ff-only` fails because the VM repository diverged from `origin/main`.

Warning:

- this discards uncommitted changes inside `/opt/masswhisper`
- do not use this as the normal update path

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper fetch origin
  sudo -u masswhisper -H git -C /opt/masswhisper reset --hard origin/main
'
```

After recovering the repository, return to `Choose The Update Path` and apply the matching update steps.

## 3. Verify The Updated Backend

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

ssh -T "massops@$server_ip" <<'EOF'
printf "local backend health: "
for _ in $(seq 1 15); do
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health 2>/dev/null || true)"
  if [[ "$http_status" == "200" ]]; then
    echo ok
    break
  fi
  sleep 1
done

if [[ "$http_status" != "200" ]]; then
  echo fail
  exit 1
fi

printf "service active: "
sudo systemctl is-active --quiet masswhisper-topic && echo ok || { echo fail; exit 1; }
EOF

printf "public api health reachable: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$public_api_domain/health")"
[[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }

printf "public api daily reachable: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$public_api_domain/daily")"
[[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }

printf "public read api cors origin allowed: "
curl -s -i \
  -H "Origin: https://fr-dev-job-market.masswhisper.com" "https://$public_api_domain/daily" \
  | grep -qi "access-control-allow-origin: https://fr-dev-job-market.masswhisper.com" \
  && echo ok || { echo fail; exit 1; }
```

## State After This Runbook

- the repository is updated on the VM
- the backend service runs the latest pulled code
- shared artifacts are rebuilt when required
- dependencies are reinstalled when required
- runtime artifacts are reapplied when required
