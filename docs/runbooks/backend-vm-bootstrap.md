# Backend VM Post-Boot Runbook

This runbook completes the `masswhisper` backend setup on a VM already bootstrapped by Terraform + cloud-init.

It assumes:

- Ubuntu 24.04
- SSH access as `root`
- the repository is reachable from the VM
- the dedicated Neon database already exists
- the backend secrets are available outside git

## 1. Transfer The Runtime Env File Securely

Transfer the backend env file to `/etc/masswhisper/backend.env` over SSH.

Ensure:

- owner is `root:masswhisper`
- mode is `640`
- the file is never committed to git

Secure approach example:

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
pass show masswhisper/runtime/fr-dev-job-market-prod/backend.env | \
  ssh "root@$server_ip" '
    set -euo pipefail
    install -d -m 755 /etc/masswhisper
    tmp=$(mktemp)
    trap "rm -f \"$tmp\"" EXIT
    cat > "$tmp"
    install -o root -g masswhisper -m 640 "$tmp" /etc/masswhisper/backend.env
'
```

If the service was already running, restart it after updating the env file.

## 2. Run Database Migrations

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -a
  source /etc/masswhisper/backend.env
  set +a

  cd /opt/masswhisper
  npm --workspace backend run db:migrate
'
```

## 3. Enable And Start The Service

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  systemctl enable masswhisper-topic
  systemctl start masswhisper-topic
  systemctl status masswhisper-topic
'
```

## 4. Inspect Logs

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'journalctl -u masswhisper-topic -n 100 --no-pager'
```

## 5. Verify Local Reachability

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -u

  printf "node binds local port 3000: "
  ss -ltnp | grep -E "127\.0\.0\.1:3000.*node" >/dev/null 2>&1 && echo "ok" || echo "fail"

  printf "local health endpoint reachable: "
  curl -s -i http://127.0.0.1:3000/health \
    | grep -q "^HTTP/1.1 200" && echo "ok" || echo "fail"

  printf "nginx local health route works: "
  curl -s -i -H "Host: api.masswhisper.com" http://127.0.0.1/health \
    | grep -q "^HTTP/1.1 200" && echo "ok" || echo "fail"

  printf "nginx local report route blocked: "
  curl -s -i -H "Host: api.masswhisper.com" http://127.0.0.1/report \
    | grep -q "^HTTP/1.1 404" && echo "ok" || echo "fail"
'
```

## 6. Verify Proxied Health

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "public health endpoint reachable: "
curl -s -i -H "Host: api.masswhisper.com" "http://$server_ip/health" \
  | grep -q "^HTTP/1.1 200" && echo "ok" || echo "fail"

printf "public report endpoint blocked: "
curl -s -i -H "Host: api.masswhisper.com" "http://$server_ip/report" \
  | grep -q "^HTTP/1.1 404" && echo "ok" || echo "fail"

printf "public node port stays closed: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && echo "fail" || echo "ok"
```

## 7. Verify Minimal Firewall Exposure

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "public tcp/22 reachable: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$server_ip" true >/dev/null 2>&1 \
  && echo "ok" || echo "fail"

printf "public tcp/80 reachable: "
curl -s --max-time 5 -o /dev/null -H "Host: api.masswhisper.com" "http://$server_ip/health" \
  && echo "ok" || echo "fail"

printf "public tcp/3000 blocked: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && echo "fail" || echo "ok"
```

## State After This Runbook

- the backend runs as a long-lived service
- the Node listener stays private on `127.0.0.1:3000`
- Nginx is configured
- `/health` responds locally and through Nginx
- the public proxy surface is limited to `/health`
- DNS/TLS and cron are not configured yet

Next step:

- follow `docs/runbooks/backend-api-dns-tls.md` to attach `api.masswhisper.com` and enable TLS
