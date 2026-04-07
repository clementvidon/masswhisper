#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  scripts/deploy/04-deploy-frontend.sh \
    --manifest <path> \
    [--dry-run]

Example:

  bash scripts/deploy/04-deploy-frontend.sh \
    --manifest instances/fr-dev-job-market/prod.yaml
USAGE
}

MANIFEST_PATH=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST_PATH=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$MANIFEST_PATH" ]] || { usage; fail "--manifest is required"; }
require_file "$MANIFEST_PATH"

DOMAIN="$(manifest_field "$MANIFEST_PATH" domain)"
TOPIC_NAME="$(manifest_field "$MANIFEST_PATH" topic_name)"

[[ -n "$DOMAIN" ]] || fail "manifest is missing: domain"
[[ -n "$TOPIC_NAME" ]] || fail "manifest is missing: topic_name"

step "04.1 Read the instance source of truth"
printf 'domain: %s\n' "$DOMAIN"
printf 'topic_name: %s\n' "$TOPIC_NAME"
printf 'runbook: %s\n' "docs/runbooks/04-frontend-dedicated-vercel.md"
step "04.2 Manual frontend deployment"
info "Frontend deployment is still manual for now."
info "Follow docs/runbooks/04-frontend-dedicated-vercel.md"
info "Then run scripts/deploy/verify-frontend.sh --manifest $MANIFEST_PATH"
