#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  # Bootstrap mode (default)
  scripts/deploy/deploy-topic.sh \
    --manifest <path> \
    --local-topic-config-dir <dir> \
    --backend-env-file <path> \
    [--certbot-email <email>] \
    [--tls-restore-from <dir>] \
    [--skip-tls] \
    [--dry-run]

  # Update mode
  scripts/deploy/deploy-topic.sh \
    --mode update \
    --manifest <path> \
    --local-topic-config-dir <dir> \
    --update-target <backend|shared|dependencies|systemd|nginx|backend-env|topic-runtime-env|tls-backup|tls-restore> \
    [--backend-env-file <path>] \
    [--tls-backup-to <dir>] \
    [--tls-restore-from <dir>] \
    [--dry-run]


Example:

  Bootstrap with new Cert:

    export HCLOUD_TOKEN="$(pass show masswhisper/infra/hcloud/token)"
    export TF_VAR_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"

    umask 077
    tmp_backend_env="$(mktemp)"
    trap 'rm -f "$tmp_backend_env"' EXIT
    pass show masswhisper/runtime/fr-dev-job-market-prod/backend.env > "$tmp_backend_env"

    bash scripts/deploy/deploy-topic.sh \
      --manifest instances/fr-dev-job-market/prod.yaml \
      --local-topic-config-dir local/config/topic-config \
      --certbot-email cvidon@student.42.fr \
      --backend-env-file "$tmp_backend_env"

    rm -f "$tmp_backend_env"

  Bootstrap with existing Cert:

    export HCLOUD_TOKEN="$(pass show masswhisper/infra/hcloud/token)"
    export TF_VAR_ssh_public_key="$(cat ~/.ssh/id_ed25519.pub)"

    umask 077
    tmp_backend_env="$(mktemp)"
    trap 'rm -f "$tmp_backend_env"' EXIT
    pass show masswhisper/runtime/fr-dev-job-market-prod/backend.env > "$tmp_backend_env"

    public_api_domain="api.fr-dev-job-market.masswhisper.com"
    backup_dir="$HOME/.local/share/masswhisper/tls-backups/$public_api_domain"

    bash scripts/deploy/deploy-topic.sh \
      --manifest instances/fr-dev-job-market/prod.yaml \
      --local-topic-config-dir local/config/topic-config \
      --certbot-email cvidon@student.42.fr \
      --backend-env-file "$tmp_backend_env" \
      --tls-restore-from "$backup_dir"

    rm -f "$tmp_backend_env"

  Update backend code:

    bash scripts/deploy/deploy-topic.sh \
        --mode update \
        --manifest instances/fr-dev-job-market/prod.yaml \
        --local-topic-config-dir local/config/topic-config \
        --update-target backend

  Backup Cert:

    public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
    backup_dir="$HOME/.local/share/masswhisper/tls-backups/$public_api_domain"

    bash scripts/deploy/deploy-topic.sh \
      --mode update \
      --manifest instances/fr-dev-job-market/prod.yaml \
      --local-topic-config-dir local/config/topic-config \
      --update-target tls-backup \
      --tls-backup-to "$backup_dir"
USAGE
}

MANIFEST_PATH=
LOCAL_TOPIC_CONFIG_DIR=
MODE=bootstrap
UPDATE_TARGET=
CERTBOT_EMAIL=
BACKEND_ENV_FILE=
SKIP_TLS=0
TLS_RESTORE_FROM=
TLS_BACKUP_TO=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST_PATH=${2:?}; shift 2 ;;
    --local-topic-config-dir) LOCAL_TOPIC_CONFIG_DIR=${2:?}; shift 2 ;;
    --mode) MODE=${2:?}; shift 2 ;;
    --update-target) UPDATE_TARGET=${2:?}; shift 2 ;;
    --certbot-email) CERTBOT_EMAIL=${2:?}; shift 2 ;;
    --tls-restore-from) TLS_RESTORE_FROM=${2:?}; shift 2 ;;
    --tls-backup-to) TLS_BACKUP_TO=${2:?}; shift 2 ;;
    --backend-env-file) BACKEND_ENV_FILE=${2:?}; shift 2 ;;
    --skip-tls) SKIP_TLS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$MANIFEST_PATH" ]] || { usage; fail "--manifest is required"; }
[[ -n "$LOCAL_TOPIC_CONFIG_DIR" ]] || { usage; fail "--local-topic-config-dir is required"; }

require_cmd npm
require_file "$MANIFEST_PATH"
require_dir "$LOCAL_TOPIC_CONFIG_DIR"

TOPIC_SLUG="$(basename -- "$(dirname -- "$MANIFEST_PATH")")"
ENVIRONMENT="$(basename -- "$MANIFEST_PATH")"
ENVIRONMENT="${ENVIRONMENT%.yaml}"

common_args=()
if [[ "$DRY_RUN" -eq 1 ]]; then
  common_args+=(--dry-run)
fi

step "Validate manifest"
run npm run validate-manifest -- "$MANIFEST_PATH" "$LOCAL_TOPIC_CONFIG_DIR"

case "$MODE" in
  bootstrap)
    [[ -z "$TLS_BACKUP_TO" ]] || fail "--tls-backup-to is only valid in update mode with --update-target tls-backup"
    if [[ "$SKIP_TLS" -eq 1 && -n "$TLS_RESTORE_FROM" ]]; then
      fail "--tls-restore-from cannot be used with --skip-tls"
    fi
    if [[ -n "$TLS_RESTORE_FROM" ]]; then
      require_dir "$TLS_RESTORE_FROM/letsencrypt"
    fi

    [[ -n "$BACKEND_ENV_FILE" ]] || fail "--backend-env-file is required in bootstrap mode"
    [[ "$BACKEND_ENV_FILE" != "-" ]] || fail "--backend-env-file must be a real file path in deploy-topic.sh"
    require_file "$BACKEND_ENV_FILE"
    test -s "$BACKEND_ENV_FILE" || fail "--backend-env-file is empty"

    "$SCRIPT_DIR/01-bootstrap-vm.sh" \
      --topic-slug "$TOPIC_SLUG" \
      --environment "$ENVIRONMENT" \
      --local-topic-config-dir "$LOCAL_TOPIC_CONFIG_DIR" \
      "${common_args[@]}"

    "$SCRIPT_DIR/02-post-boot-backend.sh" \
      --topic-slug "$TOPIC_SLUG" \
      --environment "$ENVIRONMENT" \
      --local-topic-config-dir "$LOCAL_TOPIC_CONFIG_DIR" \
      --backend-env-file "$BACKEND_ENV_FILE" \
      "${common_args[@]}"

    if [[ "$SKIP_TLS" -eq 0 ]]; then
      [[ -n "$CERTBOT_EMAIL" ]] || fail "--certbot-email is required unless --skip-tls is set"
      tls_args=()
      if [[ -n "$TLS_RESTORE_FROM" ]]; then
        tls_args+=(--tls-restore-from "$TLS_RESTORE_FROM")
      fi
      "$SCRIPT_DIR/03-enable-tls.sh" \
        --certbot-email "$CERTBOT_EMAIL" \
        "${tls_args[@]}" \
        "${common_args[@]}"
    fi

    verify_args=("${common_args[@]}")
    if [[ "$SKIP_TLS" -eq 0 ]]; then
      verify_args+=(--require-tls)
      verify_args+=(--cors-origin "https://$(manifest_field "$MANIFEST_PATH" domain)")
    fi

    "$SCRIPT_DIR/verify-backend.sh" "${verify_args[@]}"
    ;;

  update)
    [[ -n "$UPDATE_TARGET" ]] || fail "--update-target is required in update mode"
    if [[ "$UPDATE_TARGET" == "backend-env" && "$BACKEND_ENV_FILE" == "-" ]]; then
        fail "--backend-env-file must be a real file path in deploy-topic.sh"
    fi
    if [[ "$UPDATE_TARGET" == "backend-env" ]]; then
        [[ -n "$BACKEND_ENV_FILE" ]] || fail "--backend-env-file is required for update target backend-env"
        require_file "$BACKEND_ENV_FILE"
        test -s "$BACKEND_ENV_FILE" || fail "--backend-env-file is empty"
    fi

    case "$UPDATE_TARGET" in
      tls-backup)
        [[ -n "$TLS_BACKUP_TO" ]] || fail "--tls-backup-to is required for update target tls-backup"
        [[ -z "$TLS_RESTORE_FROM" ]] || fail "--tls-restore-from is not valid with update target tls-backup"
        ;;
      tls-restore)
        [[ -n "$TLS_RESTORE_FROM" ]] || fail "--tls-restore-from is required for update target tls-restore"
        [[ -z "$TLS_BACKUP_TO" ]] || fail "--tls-backup-to is not valid with update target tls-restore"
        ;;
      *)
        [[ -z "$TLS_BACKUP_TO" ]] || fail "--tls-backup-to requires --update-target tls-backup"
        [[ -z "$TLS_RESTORE_FROM" ]] || fail "--tls-restore-from requires --update-target tls-restore in update mode"
        ;;
    esac

    update_args=(--target "$UPDATE_TARGET")
    if [[ -n "$BACKEND_ENV_FILE" ]]; then
      update_args+=(--backend-env-file "$BACKEND_ENV_FILE")
    fi
    if [[ -n "$TLS_RESTORE_FROM" ]]; then
      update_args+=(--tls-restore-from "$TLS_RESTORE_FROM")
    fi
    if [[ -n "$TLS_BACKUP_TO" ]]; then
      update_args+=(--tls-backup-to "$TLS_BACKUP_TO")
    fi
    update_args+=("${common_args[@]}")

    "$SCRIPT_DIR/update-backend.sh" "${update_args[@]}"

    case "$UPDATE_TARGET" in
      tls-backup)
        ;;
      tls-restore)
        "$SCRIPT_DIR/verify-backend.sh" \
          --require-tls \
          --cors-origin "https://$(manifest_field "$MANIFEST_PATH" domain)" \
          "${common_args[@]}"
        ;;
      *)
        "$SCRIPT_DIR/verify-backend.sh" "${common_args[@]}"
        ;;
    esac
    ;;

  *)
    fail "invalid --mode: $MODE"
    ;;
esac
