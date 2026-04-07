#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  scripts/deploy/01-bootstrap-vm.sh \
    --topic-slug <slug> \
    --environment <env> \
    --local-topic-config-dir <dir> \
    [--dry-run]

Example:

  bash scripts/deploy/01-bootstrap-vm.sh \
    --topic-slug fr-dev-job-market \
    --environment prod \
    --local-topic-config-dir local/topic-config
USAGE
}

TOPIC_SLUG=
ENVIRONMENT=
LOCAL_TOPIC_CONFIG_DIR=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topic-slug) TOPIC_SLUG=${2:?}; shift 2 ;;
    --environment) ENVIRONMENT=${2:?}; shift 2 ;;
    --local-topic-config-dir) LOCAL_TOPIC_CONFIG_DIR=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$TOPIC_SLUG" ]] || { usage; fail "--topic-slug is required"; }
[[ -n "$ENVIRONMENT" ]] || { usage; fail "--environment is required"; }
[[ -n "$LOCAL_TOPIC_CONFIG_DIR" ]] || { usage; fail "--local-topic-config-dir is required"; }

require_cmd npm
require_cmd terraform
require_cmd ssh
require_cmd grep
require_cmd sed
require_env HCLOUD_TOKEN

MANIFEST_PATH="$REPO_ROOT/instances/$TOPIC_SLUG/$ENVIRONMENT.yaml"
VAR_FILE="generated/${TOPIC_SLUG}-${ENVIRONMENT}.tfvars.json"

require_file "$MANIFEST_PATH"
require_dir "$LOCAL_TOPIC_CONFIG_DIR"

step "01.1 Validate manifest"
run npm run validate-manifest -- "$MANIFEST_PATH" "$LOCAL_TOPIC_CONFIG_DIR"

step "01.2 Generate the Terraform input"
run npm run generate-topic-tf-input -- "instances/$TOPIC_SLUG/$ENVIRONMENT.yaml" "$LOCAL_TOPIC_CONFIG_DIR"

step "01.3 Initialize Terraform"
terraform_init

step "01.4 Review the plan and apply"
terraform_apply_var_file "$VAR_FILE"

SERVER_IP="$(tf_output server_ip)"

info "Clearing stale SSH host key for $SERVER_IP"
ssh-keygen -R "$SERVER_IP" >/dev/null 2>&1 || true

wait_for_ssh() {
  local host="$1"
  local tries=30
  local attempt=1

  info "Waiting for SSH..."

  while (( tries > 0 )); do
    if ssh "${SSH_OPTS[@]}" "massops@$host" true >/dev/null 2>&1; then
      info "SSH is ready on $host"
      return 0
    fi

    info "SSH not ready yet, retry $attempt/30"
    sleep 5
    tries=$((tries - 1))
    attempt=$((attempt + 1))
  done

  fail "SSH not ready on $host"
}

wait_for_ssh "$SERVER_IP"

step "01.5 Verify cloud-init output"
info "Waiting for cloud-init to finish..."
run_ssh_massops_script "$SERVER_IP" '
sudo cloud-init status --wait >/dev/null
printf '%-32s' "cloud-init:"
sudo cloud-init status | sed -n "s/^status: //p"

echo "[cloud-init] prepare ops user"
printf '%-32s' "ops user: "
if id -u massops >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "ops authorized key: "
if test -s /home/massops/.ssh/authorized_keys; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "ops sudoers file: "
if sudo test -s /etc/sudoers.d/90-massops; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] install Node"
printf '%-32s' "node: "
if node -v >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "npm: "
if npm -v >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] bootstrap repo"
printf '%-32s' "user: "
if id -u masswhisper >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "repo: "
if test -d /opt/masswhisper; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] prepare runtime"
printf '%-32s' "env: "
if sudo test -f /etc/masswhisper/backend.env; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "topic runtime env: "
if sudo test -f /etc/masswhisper/topic-runtime.env; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "unit: "
if sudo test -s /etc/systemd/system/masswhisper-topic.service; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] prepare scheduler"
printf '%-32s' "capture wrapper installed: "
if test -x /usr/local/bin/run-capture.sh; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "cron file installed: "
if sudo test -s /etc/cron.d/masswhisper-topic; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] harden ssh"
printf '%-32s' "ssh drop-in installed: "
if sudo test -f /etc/ssh/sshd_config.d/99-masswhisper.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "sshd config valid: "
if sudo sshd -t >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] configure Nginx"
printf '%-32s' "nginx site: "
if sudo test -s /etc/nginx/sites-available/public-api.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "nginx link: "
if sudo test -L /etc/nginx/sites-enabled/public-api.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "nginx config: "
if sudo nginx -t >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] configure certbot"
printf '%-32s' "certbot installed: "
if certbot --version >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf '%-32s' "acme webroot exists: "
if sudo test -d /var/www/certbot/.well-known/acme-challenge; then
  echo ok
else
  echo fail
  exit 1
fi
'
