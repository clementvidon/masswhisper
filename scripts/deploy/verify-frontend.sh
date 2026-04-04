#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<USAGE
Usage:
  scripts/deploy/verify-frontend.sh \
    --manifest <path> \
    [--require-tls] \
    [--dry-run]
USAGE
}

MANIFEST_PATH=
REQUIRE_TLS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST_PATH=${2:?}; shift 2 ;;
    --require-tls) REQUIRE_TLS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$MANIFEST_PATH" ]] || { usage; fail "--manifest is required"; }

require_file "$MANIFEST_PATH"
require_cmd terraform
require_cmd curl

DOMAIN="$(manifest_field "$MANIFEST_PATH" domain)"
TOPIC_NAME="$(manifest_field "$MANIFEST_PATH" topic_name)"
PUBLIC_API_DOMAIN="$(tf_output public_api_domain)"

[[ -n "$DOMAIN" ]] || fail "manifest is missing: domain"
[[ -n "$TOPIC_NAME" ]] || fail "manifest is missing: topic_name"

step "Verify frontend inputs"
printf 'domain: %s\n' "$DOMAIN"
printf 'topic_name: %s\n' "$TOPIC_NAME"
printf 'public_api_domain: %s\n' "$PUBLIC_API_DOMAIN"
printf 'expected VITE_API_BASE_URL=%s\n' "https://$PUBLIC_API_DOMAIN"
printf 'expected VITE_TOPIC_NAME=%s\n' "$TOPIC_NAME"

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "Verify frontend reachability"
  info "skipped in dry-run"
  exit 0
fi

if [[ "$REQUIRE_TLS" -eq 1 ]]; then
  step "Verify dedicated API"
  printf 'public api health reachable: '
  if curl -s -i "https://$PUBLIC_API_DOMAIN/health" | grep -Eq '^HTTP/[0-9.]+ 200'; then
    echo ok
  else
    echo fail
    exit 1
  fi

  printf 'public api daily reachable: '
  if curl -s -i "https://$PUBLIC_API_DOMAIN/daily" | grep -Eq '^HTTP/[0-9.]+ 200'; then
    echo ok
  else
    echo fail
    exit 1
  fi
fi

step "Verify frontend reachability"
printf 'frontend reachable: '
if curl -s -i "https://$DOMAIN" | grep -Eq '^HTTP/[0-9.]+ 200|^HTTP/[0-9.]+ 308'; then
  echo ok
else
  echo fail
  exit 1
fi

info 'manual browser check: verify https://api.<domain>/daily is used and /daily.json is not fetched from the frontend origin'
