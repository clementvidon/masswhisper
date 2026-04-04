#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<USAGE
Usage:
  scripts/deploy/01-bootstrap-vm.sh \
    --topic-slug <slug> \
    --environment <env> \
    --local-topic-config-dir <dir> \
    [--dry-run]
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

step "01.5 Verify cloud-init output"
run_ssh_root_script "$SERVER_IP" '
cloud-init status --wait

echo "[cloud-init] prepare ops user"
printf "ops user: "
if id -u massops >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf "ops authorized key: "
if test -s /home/massops/.ssh/authorized_keys; then
  echo ok
else
  echo fail
  exit 1
fi

printf "ops sudoers file: "
if test -s /etc/sudoers.d/90-massops; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] install Node"
printf "node: "
if node -v >/dev/null 2>&1; then
  node -v
else
  echo fail
  exit 1
fi

printf "npm: "
if npm -v >/dev/null 2>&1; then
  npm -v
else
  echo fail
  exit 1
fi

echo "[cloud-init] bootstrap repo"
printf "user: "
if id -u masswhisper >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf "repo: "
if test -d /opt/masswhisper; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] prepare runtime"
printf "env: "
if test -f /etc/masswhisper/backend.env; then
  stat -c "%U:%G %a %n" /etc/masswhisper/backend.env
else
  echo fail
  exit 1
fi

printf "topic runtime env: "
if test -f /etc/masswhisper/topic-runtime.env; then
  stat -c "%U:%G %a %n" /etc/masswhisper/topic-runtime.env
else
  echo fail
  exit 1
fi

printf "unit: "
if test -s /etc/systemd/system/masswhisper-topic.service; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] prepare scheduler"
printf "capture wrapper installed: "
if test -x /usr/local/bin/run-capture.sh; then
  echo ok
else
  echo fail
  exit 1
fi

printf "cron file installed: "
if test -s /etc/cron.d/masswhisper-topic; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] harden ssh"
printf "ssh drop-in installed: "
if test -f /etc/ssh/sshd_config.d/99-masswhisper.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf "sshd config valid: "
if sshd -t >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] configure Nginx"
printf "nginx site: "
if test -s /etc/nginx/sites-available/public-api.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf "nginx link: "
if test -L /etc/nginx/sites-enabled/public-api.conf; then
  echo ok
else
  echo fail
  exit 1
fi

printf "nginx config: "
if nginx -t >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

echo "[cloud-init] configure certbot"
printf "certbot installed: "
if certbot --version >/dev/null 2>&1; then
  echo ok
else
  echo fail
  exit 1
fi

printf "acme webroot exists: "
if test -d /var/www/certbot/.well-known/acme-challenge; then
  echo ok
else
  echo fail
  exit 1
fi
'
