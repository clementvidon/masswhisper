# Backend VM Post-Boot Runbook

This runbook completes the `masswhisper` backend setup on a VM already bootstrapped by Terraform + cloud-init, then enables the local capture scheduler.

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
    set -eu
    install -d -m 755 /etc/masswhisper
    tmp=$(mktemp)
    trap "rm -f \"$tmp\"" EXIT
    cat > "$tmp"
    install -o root -g masswhisper -m 640 "$tmp" /etc/masswhisper/backend.env
'
```

If the service was already running, restart it after updating the env file.

## 2. Run Database Migrations

Load the runtime env file and apply the pending database migrations before starting the backend service.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  set -a
  source /etc/masswhisper/backend.env
  set +a

  cd /opt/masswhisper
  npm --workspace backend run db:migrate
'
```

## 3. Enable And Start The Service

Once the env file and schema are ready, enable the backend service at boot and start it on the current VM.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  systemctl enable masswhisper-topic
  systemctl start masswhisper-topic
  systemctl status masswhisper-topic

  printf "masswhisper-topic service active: "
  systemctl is-active --quiet masswhisper-topic && echo ok || echo fail
'
```

## 4. Enable And Start Cron

Enable cron only after the runtime env is in place and the database is migrated.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  systemctl enable cron
  systemctl start cron
  systemctl status cron

  printf "cron service active: "
  systemctl is-active --quiet cron && echo ok || echo fail
'
```

## 5. Inspect Logs

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'journalctl -u masswhisper-topic -n 100'
```

## 6. Verify Local Reachability

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '

  printf "node binds local port 3000: "
  ss -ltnp | grep -E "127\.0\.0\.1:3000.*node" >/dev/null 2>&1 && echo ok || echo fail

  printf "local health endpoint reachable: "
  curl -s -i http://127.0.0.1:3000/health \
    | grep -q "^HTTP/1.1 200" && echo ok || echo fail

  printf "nginx local health route works: "
  curl -s -i -H "Host: api.masswhisper.com" http://127.0.0.1/health \
    | grep -q "^HTTP/1.1 200" && echo ok || echo fail

  printf "nginx local report route blocked: "
  curl -s -i -H "Host: api.masswhisper.com" http://127.0.0.1/report \
    | grep -q "^HTTP/1.1 404" && echo ok || echo fail
'
```

## 7. Verify Proxied Health

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "public health endpoint reachable: "
curl -s -i -H "Host: api.masswhisper.com" "http://$server_ip/health" \
  | grep -q "^HTTP/1.1 200" && echo ok || echo fail

printf "public report endpoint blocked: "
curl -s -i -H "Host: api.masswhisper.com" "http://$server_ip/report" \
  | grep -q "^HTTP/1.1 404" && echo ok || echo fail

printf "public node port stays closed: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && echo fail || echo ok
```

## 8. Verify Minimal Firewall Exposure

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "public tcp/22 reachable: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$server_ip" true >/dev/null 2>&1 \
  && echo ok || echo fail

printf "public tcp/80 reachable: "
curl -s --max-time 5 -o /dev/null -H "Host: api.masswhisper.com" "http://$server_ip/health" \
  && echo ok || echo fail

printf "public tcp/3000 blocked: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && echo fail || echo ok
```

## 9. Verify Manual Capture Run

Run the capture wrapper once as `masswhisper` and verify that one new snapshot is persisted.

```bash
ssh "root@$server_ip" '
  set -eu
  set -a
  source /etc/masswhisper/backend.env
  set +a
  cd /opt/masswhisper

  before_file=$(mktemp)
  after_file=$(mktemp)
  trap "rm -f \"$before_file\" \"$after_file\"" EXIT

  npm --workspace backend run export -- "$before_file" >/dev/null 2>&1
  su -s /bin/bash masswhisper -c "/usr/local/bin/run-capture.sh"
  npm --workspace backend run export -- "$after_file" >/dev/null 2>&1

  before=$(grep -c "\"id\":" "$before_file")
  after=$(grep -c "\"id\":" "$after_file")

  printf "manual capture adds a snapshot: "
  test "$after" -gt "$before" && echo ok || echo fail
'
```

## 10. Verify Lock Skip Behavior

Hold the capture lock manually, run the wrapper again, and verify that the run is skipped without creating a new snapshot.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  set -a
  source /etc/masswhisper/backend.env
  set +a

  cd /opt/masswhisper
  before_file=$(mktemp)
  after_file=$(mktemp)
  trap "rm -f \"$before_file\" \"$after_file\"" EXIT

  npm --workspace backend run export -- "$before_file" >/dev/null 2>&1

  su -s /bin/bash masswhisper -c "flock -n /tmp/masswhisper-topic-capture.lock sleep 15" &
  lock_holder=$!

  sleep 1

  su -s /bin/bash masswhisper -c "/usr/local/bin/run-capture.sh"

  npm --workspace backend run export -- "$after_file" >/dev/null 2>&1

  before=$(grep -c "\"id\":" "$before_file")
  after=$(grep -c "\"id\":" "$after_file")

  printf "locked capture exits without new snapshot: "
  test "$after" = "$before" && echo ok || echo fail

  printf "lock skip is logged: "
  journalctl -t masswhisper-capture --since "2 minutes ago" \
    | grep -q "capture skipped: lock held" && echo ok || echo fail

  wait "$lock_holder"
'
```

## State After This Runbook

- the backend runs as a long-lived service
- the Node listener stays private on `127.0.0.1:3000`
- Nginx is configured
- `/health` responds locally and through Nginx
- the public proxy surface is limited to `/health`
- local capture is configured through `cron` and `flock`
- DNS/TLS are not configured yet

Next step:

- follow `docs/runbooks/backend-api-dns-tls.md` to attach `api.masswhisper.com` and enable TLS
