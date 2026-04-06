# 02 - Backend VM Post-Boot Runbook

This runbook completes the `masswhisper` backend setup on a VM already bootstrapped by Terraform + cloud-init, then enables the local capture scheduler.

Estimated hands-on time: 5 minutes

It assumes:

- Ubuntu 24.04
- SSH access as `root`
- the repository is reachable from the VM
- the dedicated Neon database already exists
- the backend secrets are available outside git

Operator variables:

```zsh
export PASS_SECRET_PATH=masswhisper/runtime/fr-dev-job-market-prod/backend.env
export LOCAL_TOPIC_CONFIG_DIR=$HOME/projects/masswhisper/local/topic-config
export TOPIC_SLUG=fr-dev-job-market
```

- `LOCAL_TOPIC_CONFIG_DIR` must follow the format documented in `docs/topic-config.md`.
- `TOPIC_SLUG` is the canonical topic identity from the instance manifest. It must match
  `instances/<topic-slug>/<environment>.yaml` and the local bundle filenames. It is not derived
  from `domain` and does not need to mirror the public hostname.

## 1. Install The Local Topic Config

Transfer the local topic config files to `/etc/masswhisper/`

```zsh
setopt nullglob
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'install -d -m 700 /tmp/prompts /tmp/sources'
scp "$LOCAL_TOPIC_CONFIG_DIR"/prompts/${TOPIC_SLUG}-v*.json "root@$server_ip:/tmp/prompts/"
scp "$LOCAL_TOPIC_CONFIG_DIR"/sources/${TOPIC_SLUG}-v*.json "root@$server_ip:/tmp/sources/"
ssh "root@$server_ip" '
  set -eu

  install -d -m 750 -o root -g masswhisper /etc/masswhisper/prompts
  for file in /tmp/prompts/'"${TOPIC_SLUG}"'-v*.json; do
    install -o root -g masswhisper -m 640 "$file" /etc/masswhisper/prompts/
    rm -f "$file"
  done

  install -d -m 750 -o root -g masswhisper /etc/masswhisper/sources
  for file in /tmp/sources/'"${TOPIC_SLUG}"'-v*.json; do
    install -o root -g masswhisper -m 640 "$file" /etc/masswhisper/sources/
    rm -f "$file"
  done
'
```

## 2. Securely Transfer The Runtime Env

Transfer the backend env file to `/etc/masswhisper/backend.env` over SSH.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
: "${PASS_SECRET_PATH:?PASS_SECRET_PATH must be set}"
pass show "$PASS_SECRET_PATH" | \
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

## 3. Run Database Migrations

Load the runtime env file and apply the pending database migrations before starting the backend service.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  set -a
  source /etc/masswhisper/topic-runtime.env
  source /etc/masswhisper/backend.env
  set +a

  cd /opt/masswhisper
  npm --workspace backend run db:migrate
'
```

## 4. Enable And Start The Service

Once the env file and schema are ready, enable the backend service at boot and start it on the current VM.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  systemctl enable masswhisper-topic
  systemctl start masswhisper-topic
  systemctl status masswhisper-topic

  printf "masswhisper-topic service active: "
  systemctl is-active --quiet masswhisper-topic && echo ok || { echo fail; exit 1; }
'
```

## 5. Enable And Start Cron

Enable cron only after the runtime env is in place and the database is migrated.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  systemctl enable cron
  systemctl start cron
  systemctl status cron

  printf "cron service active: "
  systemctl is-active --quiet cron && echo ok || { echo fail; exit 1; }
'
```

## 6. Verify Local Reachability

If you rerun this after TLS activation, `301` is also acceptable on Nginx HTTP checks because the public API may already redirect HTTP to HTTPS.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

ssh "root@$server_ip" '
  set -eu
  public_api_domain='"$public_api_domain"'

  printf "node binds local port 3000: "
  ss -ltnp | grep -E "127\.0\.0\.1:3000.*node" >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }

  printf "nginx local health route works: "
  http_status="$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: $public_api_domain" http://127.0.0.1/health)"
  [[ "$http_status" == "200" || "$http_status" == "301" ]] && echo ok || { echo fail; exit 1; }

  printf "nginx local daily route works: "
  http_status="$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: $public_api_domain" http://127.0.0.1/daily)"
  [[ "$http_status" == "200" || "$http_status" == "301" || "$http_status" == "503" ]] && echo ok || { echo fail; exit 1; }

  printf "local health endpoint reachable: "
  http_status="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health)"
  [[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }

  printf "local daily endpoint reachable: "
  http_status="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/daily)"
  [[ "$http_status" == "200" || "$http_status" == "503" ]] && echo ok || { echo fail; exit 1; }
'
```

## 7. Verify Proxied Health

If you rerun this after TLS activation, `301` is also acceptable because the public HTTP endpoint may already redirect to HTTPS.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

printf "public health endpoint reachable: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: $public_api_domain" "http://$server_ip/health")"
[[ "$http_status" == "200" || "$http_status" == "301" ]] && echo ok || { echo fail; exit 1; }

printf "public node port stays closed: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && { echo fail; exit 1; } || echo ok
```

## 8. Verify Minimal Firewall Exposure

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

printf '%s' "public tcp/22 reachable: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$server_ip" true >/dev/null 2>&1 \
  && echo ok || { echo fail; exit 1; }

printf '%s' "public tcp/80 reachable: "
curl -s --max-time 5 -o /dev/null -H "Host: $public_api_domain" "http://$server_ip/health" \
  && echo ok || { echo fail; exit 1; }

printf '%s' "public tcp/3000 blocked: "
curl -s --max-time 5 "http://$server_ip:3000/health" >/dev/null 2>&1 \
  && { echo fail; exit 1; } || echo ok
```

## 9. Verify Manual Capture Run

Run the capture wrapper once as `masswhisper` and verify that one new snapshot is persisted.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  json_array_length() {
    node -e "const fs=require('\''fs'\''); console.log(JSON.parse(fs.readFileSync(process.argv[1], '\''utf8'\'')).length)" "$1"
  }
  set -a
  source /etc/masswhisper/topic-runtime.env
  source /etc/masswhisper/backend.env
  set +a
  cd /opt/masswhisper

  before_file=$(mktemp)
  after_file=$(mktemp)
  trap "rm -f \"$before_file\" \"$after_file\"" EXIT

  npm --workspace backend run export -- "$before_file" >/dev/null 2>&1
  su -s /bin/bash masswhisper -c "/usr/local/bin/run-capture.sh"
  npm --workspace backend run export -- "$after_file" >/dev/null 2>&1

  printf "daily bundle file created: "
  test -s /var/lib/masswhisper/read-api/daily-bundle.json && echo ok || { echo fail; exit 1; }

  before=$(json_array_length "$before_file")
  after=$(json_array_length "$after_file")

  printf "local daily endpoint reachable after capture: "
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/daily)"
  [[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }

  printf "manual capture adds a snapshot: "
  test "$after" -gt "$before" && echo ok || { echo fail; exit 1; }
'
```

Check the capture log in parallel in a separate terminal:

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'journalctl -f -t masswhisper-capture'
```

## 10. Verify Lock Skip Behavior

Hold the capture lock manually, run the wrapper again, and verify that the run is skipped without creating a new snapshot.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  json_array_length() {
    node -e "const fs=require('\''fs'\''); console.log(JSON.parse(fs.readFileSync(process.argv[1], '\''utf8'\'')).length)" "$1"
  }
  set -a
  source /etc/masswhisper/topic-runtime.env
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

  before=$(json_array_length "$before_file")
  after=$(json_array_length "$after_file")

  printf "locked capture exits without new snapshot: "
  test "$after" = "$before" && echo ok || { echo fail; exit 1; }

  printf "lock skip is logged: "
  journalctl -t masswhisper-capture --since "2 minutes ago" \
    | grep -q "capture skipped: lock held" && echo ok || { echo fail; exit 1; }

  wait "$lock_holder"
'
```

## 11. Verify Ops User Access

Verify that the dedicated ops user can connect over SSH and use sudo without a password.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "ops ssh access works: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "massops@$server_ip" true >/dev/null 2>&1 \
  && echo ok || { echo fail; exit 1; }

printf "ops passwordless sudo works: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "massops@$server_ip" "sudo -n true" >/dev/null 2>&1 \
  && echo ok || { echo fail; exit 1; }
```

## 12. Enable DNS And TLS

Follow `docs/runbooks/03-backend-api-dns-tls.md` to attach the current Terraform `public_api_domain` and enable TLS.

## 13. Lock Root SSH Access

Once massops access is validated, disable root SSH login entirely.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  install -D -m 0644 /opt/masswhisper/deploy/ssh/sshd_config.final.conf /etc/ssh/sshd_config.d/99-masswhisper.conf
  sshd -t
  systemctl reload ssh
'

printf "ops ssh access still works: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "massops@$server_ip" true >/dev/null 2>&1 \
  && echo ok || { echo fail; exit 1; }

printf "root ssh access is denied: "
ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$server_ip" true >/dev/null 2>&1 \
  && { echo fail; exit 1; }
```

## 14. Closure Criteria

Consider the runtime closed only after a fresh end-to-end replay confirms that:

- the replay starts from a clean state, typically after `terraform destroy`
- the Terraform Hetzner runbook passes
- the backend post-boot runbook passes
- the DNS and TLS runbook passes
- the backend service, proxy, scheduler, SSH hardening, and public API all work together on the final runtime

## State After This Runbook

- the backend runs as a long-lived service
- the Node listener stays private on `127.0.0.1:3000`
- Nginx is configured
- `/health` responds locally and through Nginx
- the public proxy surface is limited to `/health`
- local capture is configured through `cron` and `flock`
- routine SSH access goes through massops
- root SSH login is disabled after ops access validation
- DNS/TLS are configured after the dedicated runbook is completed

Next step:

- follow `docs/runbooks/04-frontend-dedicated-vercel.md` to deploy the dedicated frontend
