#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  scripts/deploy/02-post-boot-backend.sh \
    --topic-slug <slug> \
    --environment <env> \
    --local-topic-config-dir <dir> \
    --backend-env-file <path|-> \
    [--dry-run]

Notes:

  --backend-env-file <path|->   Use - to read the backend env file from stdin.

Example:

  pass show masswhisper/runtime/fr-dev-job-market-prod/backend.env | \
    bash scripts/deploy/02-post-boot-backend.sh \
      --topic-slug fr-dev-job-market \
      --environment prod \
      --local-topic-config-dir local/topic-config \
      --backend-env-file -
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

REMOTE_STAGE_DIR=
tmp_backend_env=$(mktemp)
cleanup() {
  if [[ -n "${tmp_backend_env:-}" ]]; then
    rm -f "$tmp_backend_env"
  fi
  cleanup_remote_stage_dir_massops "$SERVER_IP" "$REMOTE_STAGE_DIR"
}
trap cleanup EXIT
read_backend_env_to_temp "$BACKEND_ENV_FILE" "$tmp_backend_env"
test -s "$tmp_backend_env" || fail "backend env file is empty"
REMOTE_STAGE_DIR="$(create_remote_stage_dir_massops "$SERVER_IP")"

step "02.1 Install the local topic config"
ssh_massops "$SERVER_IP" "install -d -m 700 '$REMOTE_STAGE_DIR/prompts' '$REMOTE_STAGE_DIR/sources'"
shopt -s nullglob
prompt_files=("$LOCAL_TOPIC_CONFIG_DIR"/prompts/${TOPIC_SLUG}-v*.json)
source_files=("$LOCAL_TOPIC_CONFIG_DIR"/sources/${TOPIC_SLUG}-v*.json)
shopt -u nullglob

((${#prompt_files[@]} > 0)) || fail "no prompt files found for $TOPIC_SLUG"
((${#source_files[@]} > 0)) || fail "no source files found for $TOPIC_SLUG"

for file in "${prompt_files[@]}"; do
  scp_to_massops "$file" "$SERVER_IP" "$REMOTE_STAGE_DIR/prompts/"
done

for file in "${source_files[@]}"; do
  scp_to_massops "$file" "$SERVER_IP" "$REMOTE_STAGE_DIR/sources/"
done

run_ssh_massops_script "$SERVER_IP" '
set -eu
TOPIC_SLUG='"$TOPIC_SLUG"'
REMOTE_STAGE_DIR='"$REMOTE_STAGE_DIR"'

sudo install -d -m 750 -o root -g masswhisper /etc/masswhisper/prompts
for file in "$REMOTE_STAGE_DIR"/prompts/${TOPIC_SLUG}-v*.json; do
  sudo install -o root -g masswhisper -m 640 "$file" /etc/masswhisper/prompts/
  rm -f "$file"
done

sudo install -d -m 750 -o root -g masswhisper /etc/masswhisper/sources
for file in "$REMOTE_STAGE_DIR"/sources/${TOPIC_SLUG}-v*.json; do
  sudo install -o root -g masswhisper -m 640 "$file" /etc/masswhisper/sources/
  rm -f "$file"
done
'

step "02.2 Securely transfer the runtime env"
scp_to_massops "$tmp_backend_env" "$SERVER_IP" "$REMOTE_STAGE_DIR/backend.env"
rm -f "$tmp_backend_env"
unset tmp_backend_env
run_ssh_massops_script "$SERVER_IP" '
set -eu
REMOTE_STAGE_DIR='"$REMOTE_STAGE_DIR"'
sudo install -d -m 755 /etc/masswhisper
sudo install -o root -g masswhisper -m 640 "$REMOTE_STAGE_DIR/backend.env" /etc/masswhisper/backend.env
rm -f "$REMOTE_STAGE_DIR/backend.env"
'

step "02.3 Run database migrations"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H bash -seEu -o pipefail <<\EOF_MIGRATE
set -eu
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a
cd /opt/masswhisper
/usr/local/bin/npm --workspace backend run db:migrate
EOF_MIGRATE
'

step "02.4 Enable and start the service"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo systemctl enable masswhisper-topic
sudo systemctl start masswhisper-topic

printf "masswhisper-topic service active: "
if sudo systemctl is-active --quiet masswhisper-topic; then
  echo ok
else
  echo fail
  sudo systemctl status masswhisper-topic --no-pager
  exit 1
fi
'

step "02.5 Enable and start cron"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo systemctl enable cron
sudo systemctl start cron

printf "cron service active: "
if sudo systemctl is-active --quiet cron; then
  echo ok
else
  echo fail
  sudo systemctl status cron --no-pager
  exit 1
fi
'

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "02.6 Verify local reachability"
  info "skipped in dry-run"

  step "02.7 Verify proxied health"
  info "skipped in dry-run"

  step "02.8 Verify minimal firewall exposure"
  info "skipped in dry-run"

  step "02.9 Verify manual capture run"
  info "skipped in dry-run"

  step "02.10 Verify lock skip behavior"
  info "skipped in dry-run"

  step "02.11 Verify ops user access"
  info "skipped in dry-run"

  step "02.12 Lock root SSH access"
  info "skipped in dry-run"
  exit 0
fi

step "02.6 Verify local reachability"
run_ssh_massops_script "$SERVER_IP" '
set -eu
PUBLIC_API_DOMAIN='"$PUBLIC_API_DOMAIN"'

printf "node binds local port 3000: "
if sudo ss -ltnp | grep -E "127\.0\.0\.1:3000.*node" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf "nginx local health route works: "
http_status="$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: $PUBLIC_API_DOMAIN" http://127.0.0.1/health)"
if [[ "$http_status" == "200" || "$http_status" == "301" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf "nginx local daily route works: "
http_status="$(curl -sS -o /dev/null -w "%{http_code}" -H "Host: $PUBLIC_API_DOMAIN" http://127.0.0.1/daily)"
if [[ "$http_status" == "200" || "$http_status" == "301" || "$http_status" == "503" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf "local health endpoint reachable: "
http_status="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health)"
if [[ "$http_status" == "200" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf "local daily endpoint reachable: "
http_status="$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/daily)"
if [[ "$http_status" == "200" || "$http_status" == "503" ]]; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "02.7 Verify proxied health"
printf 'public health endpoint reachable: '
http_status="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: $PUBLIC_API_DOMAIN" "http://$SERVER_IP/health")"
if [[ "$http_status" == "200" || "$http_status" == "301" ]]; then
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

step "02.8 Verify minimal firewall exposure"
printf 'public tcp/22 reachable: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" true >/dev/null 2>&1; then
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

step "02.9 Verify manual capture run"
run_ssh_massops_script "$SERVER_IP" '
set -eu

json_array_length() {
  sudo node -e "const fs=require('\''fs'\''); console.log(JSON.parse(fs.readFileSync(process.argv[1], '\''utf8'\'')).length)" "$1"
}

before_file=$(sudo -u masswhisper -H mktemp)
after_file=$(sudo -u masswhisper -H mktemp)
trap "sudo rm -f \"$before_file\" \"$after_file\"" EXIT

sudo -u masswhisper -H bash -seEu -o pipefail -- "$before_file" "$after_file" <<\EOF_CAPTURE
set -eu
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a
cd /opt/masswhisper
/usr/local/bin/npm --workspace backend run export -- "$1" >/dev/null 2>&1
/usr/local/bin/run-capture.sh
/usr/local/bin/npm --workspace backend run export -- "$2" >/dev/null 2>&1
EOF_CAPTURE

printf "daily bundle file created: "
if sudo test -s /var/lib/masswhisper/read-api/daily-bundle.json; then
  echo ok
else
  echo fail
  exit 1
fi

before=$(json_array_length "$before_file")
after=$(json_array_length "$after_file")

printf "local daily endpoint reachable after capture: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/daily)"
if [[ "$http_status" == "200" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf "manual capture adds a snapshot: "
if test "$after" -gt "$before"; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "02.10 Verify lock skip behavior"
run_ssh_massops_script "$SERVER_IP" '
set -eu

json_array_length() {
  sudo node -e "const fs=require('\''fs'\''); console.log(JSON.parse(fs.readFileSync(process.argv[1], '\''utf8'\'')).length)" "$1"
}

before_file=$(sudo -u masswhisper -H mktemp)
after_file=$(sudo -u masswhisper -H mktemp)
trap "sudo rm -f \"$before_file\" \"$after_file\"" EXIT

sudo -u masswhisper -H bash -seEu -o pipefail -- "$before_file" <<\EOF_EXPORT_BEFORE
set -eu
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a
cd /opt/masswhisper
/usr/local/bin/npm --workspace backend run export -- "$1" >/dev/null 2>&1
EOF_EXPORT_BEFORE
sudo -u masswhisper -H flock -n /run/masswhisper/topic-capture.lock sleep 15 &
lock_holder=$!
sleep 1
sudo -u masswhisper -H bash -seEu -o pipefail -- "$after_file" <<\EOF_CAPTURE_AFTER
set -eu
set -a
source /etc/masswhisper/topic-runtime.env
source /etc/masswhisper/backend.env
set +a
cd /opt/masswhisper
/usr/local/bin/run-capture.sh
/usr/local/bin/npm --workspace backend run export -- "$1" >/dev/null 2>&1
EOF_CAPTURE_AFTER

before=$(json_array_length "$before_file")
after=$(json_array_length "$after_file")

printf "locked capture exits without new snapshot: "
if test "$after" = "$before"; then
  echo ok
else
  echo fail
  exit 1
fi

printf "lock skip is logged: "
if sudo journalctl -t masswhisper-capture --since "2 minutes ago" | grep -q "capture skipped: lock held"; then
  echo ok
else
  echo fail
  exit 1
fi

wait "$lock_holder"
'

step "02.11 Verify ops user access"
printf 'ops ssh access works: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" true >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'ops passwordless sudo works: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo -n true" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

step "02.12 Lock root SSH access"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo install -D -m 0644 /opt/masswhisper/deploy/ssh/sshd_config.final.conf /etc/ssh/sshd_config.d/99-masswhisper.conf
sudo sshd -t
sudo systemctl reload ssh
'

printf 'ops ssh access still works: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" true >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'ops passwordless sudo still works: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo -n true" >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'root ssh access is denied: '
if ssh "${SSH_OPTS[@]}" "root@$SERVER_IP" true >/dev/null 2>&1; then
  echo fail
  exit 1
else
  echo ok
fi
