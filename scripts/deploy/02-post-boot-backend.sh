#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<USAGE
Usage:
  scripts/deploy/02-post-boot-backend.sh \
    --topic-slug <slug> \
    --environment <env> \
    --local-topic-config-dir <dir> \
    --backend-env-file <path|-> \
    [--dry-run]
USAGE
}

TOPIC_SLUG=
ENVIRONMENT=
LOCAL_TOPIC_CONFIG_DIR=
BACKEND_ENV_FILE=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topic-slug) TOPIC_SLUG=${2:?}; shift 2 ;;
    --environment) ENVIRONMENT=${2:?}; shift 2 ;;
    --local-topic-config-dir) LOCAL_TOPIC_CONFIG_DIR=${2:?}; shift 2 ;;
    --backend-env-file) BACKEND_ENV_FILE=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$TOPIC_SLUG" ]] || { usage; fail "--topic-slug is required"; }
[[ -n "$ENVIRONMENT" ]] || { usage; fail "--environment is required"; }
[[ -n "$LOCAL_TOPIC_CONFIG_DIR" ]] || { usage; fail "--local-topic-config-dir is required"; }
[[ -n "$BACKEND_ENV_FILE" ]] || { usage; fail "--backend-env-file is required"; }

require_cmd terraform
require_cmd ssh
require_cmd scp
require_cmd curl
require_cmd grep
require_dir "$LOCAL_TOPIC_CONFIG_DIR"

SERVER_IP="$(tf_output server_ip)"
PUBLIC_API_DOMAIN="$(tf_output public_api_domain)"

tmp_backend_env=$(mktemp)
trap 'rm -f "$tmp_backend_env"' EXIT
read_backend_env_to_temp "$BACKEND_ENV_FILE" "$tmp_backend_env"

step "02.1 Install the local topic config"
ssh_root "$SERVER_IP" 'install -d -m 700 /tmp/prompts /tmp/sources'

shopt -s nullglob
prompt_files=("$LOCAL_TOPIC_CONFIG_DIR"/prompts/${TOPIC_SLUG}-v*.json)
source_files=("$LOCAL_TOPIC_CONFIG_DIR"/sources/${TOPIC_SLUG}-v*.json)
shopt -u nullglob

((${#prompt_files[@]} > 0)) || fail "no prompt files found for $TOPIC_SLUG"
((${#source_files[@]} > 0)) || fail "no source files found for $TOPIC_SLUG"

for file in "${prompt_files[@]}"; do
  scp_to_root "$file" "$SERVER_IP" /tmp/prompts/
done

for file in "${source_files[@]}"; do
  scp_to_root "$file" "$SERVER_IP" /tmp/sources/
done

run_ssh_root_script "$SERVER_IP" "
set -eu
install -d -m 750 -o root -g masswhisper /etc/masswhisper/prompts
for file in /tmp/prompts/${TOPIC_SLUG}-v*.json; do
  install -o root -g masswhisper -m 640 \"\$file\" /etc/masswhisper/prompts/
  rm -f \"\$file\"
done

install -d -m 750 -o root -g masswhisper /etc/masswhisper/sources
for file in /tmp/sources/${TOPIC_SLUG}-v*.json; do
  install -o root -g masswhisper -m 640 \"\$file\" /etc/masswhisper/sources/
  rm -f \"\$file\"
done
"

step "02.2 Securely transfer the runtime env"
scp_to_root "$tmp_backend_env" "$SERVER_IP" /tmp/backend.env
run_ssh_root_script "$SERVER_IP" '
set -eu
install -d -m 755 /etc/masswhisper
install -o root -g masswhisper -m 640 /tmp/backend.env /etc/masswhisper/backend.env
rm -f /tmp/backend.env
'

step "02.3 Run database migrations"
run_ssh_root_script "$SERVER_IP" '
set -eu
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a
cd /opt/masswhisper
npm --workspace backend run db:migrate
'

step "02.4 Enable and start the service"
run_ssh_root_script "$SERVER_IP" '
set -eu
systemctl enable masswhisper-topic
systemctl start masswhisper-topic
systemctl status masswhisper-topic --no-pager

printf "masswhisper-topic service active: "
if systemctl is-active --quiet masswhisper-topic; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "02.5 Enable and start cron"
run_ssh_root_script "$SERVER_IP" '
set -eu
systemctl enable cron
systemctl start cron
systemctl status cron --no-pager

printf "cron service active: "
if systemctl is-active --quiet cron; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "02.6 Inspect logs"
ssh_root "$SERVER_IP" journalctl -u masswhisper-topic -n 100 --no-pager

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "02.7 Verify local reachability"
  info "skipped in dry-run"

  step "02.8 Verify proxied health"
  info "skipped in dry-run"

  step "02.9 Verify minimal firewall exposure"
  info "skipped in dry-run"

  step "02.10 Verify manual capture run"
  info "skipped in dry-run"

  step "02.11 Verify lock skip behavior"
  info "skipped in dry-run"

  step "02.12 Verify ops user access"
  info "skipped in dry-run"
  exit 0
fi

step "02.7 Verify local reachability"
run_ssh_root_script "$SERVER_IP" "
printf 'node binds local port 3000: '
if ss -ltnp | grep -E '127\\.0\\.0\\.1:3000.*node' >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'nginx local health route works: '
if curl -s -i -H 'Host: $PUBLIC_API_DOMAIN' http://127.0.0.1/health | grep -q '^HTTP/1.1 200'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'nginx local daily route works: '
if curl -s -i -H 'Host: $PUBLIC_API_DOMAIN' http://127.0.0.1/daily | grep -Eq '^HTTP/[0-9.]+ 200'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'local health endpoint reachable: '
if curl -s -i http://127.0.0.1:3000/health | grep -q '^HTTP/1.1 200'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'local daily endpoint reachable: '
if curl -s -i http://127.0.0.1:3000/daily | grep -Eq '^HTTP/[0-9.]+ 200'; then
  echo ok
else
  echo fail
  exit 1
fi
"

step "02.8 Verify proxied health"
printf 'public health endpoint reachable: '
if curl -s -i -H "Host: $PUBLIC_API_DOMAIN" "http://$SERVER_IP/health" | grep -q '^HTTP/1.1 200'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'public node port stays closed: '
if ! curl -s --max-time 5 "http://$SERVER_IP:3000/health" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

step "02.9 Verify minimal firewall exposure"
printf 'public tcp/22 reachable: '
if ssh -o BatchMode=yes -o ConnectTimeout=5 "root@$SERVER_IP" true >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'public tcp/80 reachable: '
if curl -s --max-time 5 -o /dev/null -H "Host: $PUBLIC_API_DOMAIN" "http://$SERVER_IP/health"; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'public tcp/3000 blocked: '
if ! curl -s --max-time 5 "http://$SERVER_IP:3000/health" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

step "02.10 Verify manual capture run"
run_ssh_root_script "$SERVER_IP" '
set -eu
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
if test -s /var/lib/masswhisper/read-api/daily-bundle.json; then
  echo ok
else
  echo fail
  exit 1
fi

before=$(grep -c '"id":' "$before_file")
after=$(grep -c '"id":' "$after_file")

printf "manual capture adds a snapshot: "
if test "$after" -gt "$before"; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "02.11 Verify lock skip behavior"
run_ssh_root_script "$SERVER_IP" '
set -eu
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

before=$(grep -c '"id":' "$before_file")
after=$(grep -c '"id":' "$after_file")

printf "locked capture exits without new snapshot: "
if test "$after" = "$before"; then
  echo ok
else
  echo fail
  exit 1
fi

printf "lock skip is logged: "
if journalctl -t masswhisper-capture --since "2 minutes ago" | grep -q "capture skipped: lock held"; then
  echo ok
else
  echo fail
  exit 1
fi

wait "$lock_holder"
'

step "02.12 Verify ops user access"
printf 'ops ssh access works: '
if ssh -o BatchMode=yes -o ConnectTimeout=5 "massops@$SERVER_IP" true >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'ops passwordless sudo works: '
if ssh -o BatchMode=yes -o ConnectTimeout=5 "massops@$SERVER_IP" "sudo -n true" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi
