# 05 - Backend VM Update Runbook

This runbook updates the backend repository on an already provisioned VM and reapplies the required runtime artifacts depending on the modified files.

Estimated hands-on time: 2 minutes

It assumes:

- Ubuntu 24.04
- SSH access as `massops`
- passwordless sudo for `massops`
- the repository already exists at `/opt/masswhisper`
- the backend service is already installed on the VM

## 1. Pull The Latest Repository State

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
'
```

## 2. Reapply The Required Runtime Changes

Use the matching update path:

- `backend` code changes: restart the backend service
- `shared/` changes: rebuild shared artifacts, then restart the backend service
- `dependency` changes: reinstall dependencies, rebuild shared artifacts, then restart the backend service
- `deploy/systemd/` changes: reinstall the systemd unit, run daemon-reload, then restart the backend service
- `deploy/proxy/` changes: reinstall the active Nginx config, validate it, then reload Nginx

### Backend Code

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo systemctl restart masswhisper-topic
'
```

### Shared

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H bash -lc "cd /opt/masswhisper && npm run build-shared"
  sudo systemctl restart masswhisper-topic
'
```

### Dependencies

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo -u masswhisper -H bash -lc "cd /opt/masswhisper && HUSKY=0 npm ci && npm run build-shared"
  sudo systemctl restart masswhisper-topic
'
```

### Systemd Unit

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo install -D -m 0644 /opt/masswhisper/deploy/systemd/masswhisper-topic.service /etc/systemd/system/masswhisper-
topic.service
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
  sudo install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
  sudo nginx -t
  sudo systemctl reload nginx
'
```

## 3. Verify The Updated Backend

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
ssh "massops@$server_ip" '
  printf "local backend health: "
  curl -s -i http://127.0.0.1:3000/health | grep -Eq "^HTTP/[0-9.]+ 200" && echo ok || echo fail

  printf "service active: "
  sudo systemctl is-active --quiet masswhisper-topic && echo ok || echo fail
'
```

```zsh
printf "public api health reachable: "
curl -s -i "https://$public_api_domain/health" \
  | grep -Eq "^HTTP/[0-9.]+ 200" && echo ok || echo fail
```

## State After This Runbook

- the repository is updated on the VM
- the backend service runs the latest pulled code
- shared artifacts are rebuilt when required
- dependencies are reinstalled when required
- runtime artifacts are reapplied when required
