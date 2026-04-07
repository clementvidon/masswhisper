#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  scripts/deploy/update-backend.sh \
    --target <backend|shared|dependencies|systemd|nginx|backend-env|topic-runtime-env> \
    [--backend-env-file <path|->] \
    [--dry-run]

Notes:
  --backend-env-file <path|->   Required for --target backend-env. Use - to read from stdin.

Example:

  bash scripts/deploy/update-backend.sh --target backend
USAGE
}

TARGET=
BACKEND_ENV_FILE=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET=${2:?}; shift 2 ;;
    --backend-env-file) BACKEND_ENV_FILE=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$TARGET" ]] || { usage; fail "--target is required"; }

case "$TARGET" in
  backend|shared|dependencies|systemd|nginx|backend-env|topic-runtime-env) ;;
  *) fail "invalid --target: $TARGET" ;;
esac

require_cmd terraform
require_cmd ssh
SERVER_IP="$(tf_output server_ip)"
REMOTE_STAGE_DIR=
tmp_backend_env=
tmp_topic_runtime_env=

cleanup() {
  if [[ -n "$tmp_backend_env" ]]; then
    rm -f "$tmp_backend_env"
  fi
  if [[ -n "$tmp_topic_runtime_env" ]]; then
    rm -f "$tmp_topic_runtime_env"
  fi
  cleanup_remote_stage_dir_massops "$SERVER_IP" "$REMOTE_STAGE_DIR"
}
trap cleanup EXIT

if [[ "$TARGET" == "backend-env" ]]; then
  [[ -n "$BACKEND_ENV_FILE" ]] || fail "--backend-env-file is required for target backend-env"
  tmp_backend_env=$(mktemp)
  read_backend_env_to_temp "$BACKEND_ENV_FILE" "$tmp_backend_env"
  test -s "$tmp_backend_env" || fail "backend env file is empty"
fi

step "05.2 Apply the matching update"
case "$TARGET" in
  backend-env)
    REMOTE_STAGE_DIR="$(create_remote_stage_dir_massops "$SERVER_IP")"
    scp_to_massops "$tmp_backend_env" "$SERVER_IP" "$REMOTE_STAGE_DIR/backend.env"
    run_ssh_massops_script "$SERVER_IP" '
set -eu
REMOTE_STAGE_DIR='"$REMOTE_STAGE_DIR"'
sudo install -d -m 755 /etc/masswhisper
sudo install -o root -g masswhisper -m 640 "$REMOTE_STAGE_DIR/backend.env" /etc/masswhisper/backend.env
rm -f "$REMOTE_STAGE_DIR/backend.env"
sudo systemctl restart masswhisper-topic
'
    ;;

  topic-runtime-env)
    if [[ "$DRY_RUN" -eq 1 ]]; then
      info 'would export terraform output topic_runtime_env and install /etc/masswhisper/topic-runtime.env'
    else
      tmp_topic_runtime_env=$(mktemp)
      terraform -chdir="$REPO_ROOT/infra/terraform" output -raw topic_runtime_env > "$tmp_topic_runtime_env"
      REMOTE_STAGE_DIR="$(create_remote_stage_dir_massops "$SERVER_IP")"
      scp_to_massops "$tmp_topic_runtime_env" "$SERVER_IP" "$REMOTE_STAGE_DIR/topic-runtime.env"
      run_ssh_massops_script "$SERVER_IP" '
set -eu
REMOTE_STAGE_DIR='"$REMOTE_STAGE_DIR"'
sudo install -d -m 755 /etc/masswhisper
sudo install -o root -g masswhisper -m 640 "$REMOTE_STAGE_DIR/topic-runtime.env" /etc/masswhisper/topic-runtime.env
rm -f "$REMOTE_STAGE_DIR/topic-runtime.env"
sudo systemctl restart masswhisper-topic
'
    fi
    ;;

  backend)
    run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
sudo systemctl restart masswhisper-topic
'
    ;;

  shared)
    run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
sudo -u masswhisper -H bash -seEu -o pipefail <<\EOF_SHARED
set -eu
cd /opt/masswhisper
npm run build-shared
EOF_SHARED
sudo systemctl restart masswhisper-topic
'
    ;;

  dependencies)
    run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
sudo -u masswhisper -H bash -seEu -o pipefail <<\EOF_DEPENDENCIES
set -eu
cd /opt/masswhisper
HUSKY=0 npm ci
npm run build-shared
EOF_DEPENDENCIES
sudo systemctl restart masswhisper-topic
'
    ;;

  systemd)
    run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
sudo install -D -m 0644 /opt/masswhisper/deploy/systemd/masswhisper-topic.service /etc/systemd/system/masswhisper-topic.service
sudo systemctl daemon-reload
sudo systemctl restart masswhisper-topic
'
    ;;

  nginx)
    run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo -u masswhisper -H git -C /opt/masswhisper pull --ff-only
sudo install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
sudo nginx -t
sudo systemctl reload nginx
'
    ;;
esac
