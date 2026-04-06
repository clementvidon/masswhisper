#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<USAGE
Usage:
  scripts/deploy/verify-backend.sh \
    [--cors-origin <origin>] \
    [--require-tls] \
    [--dry-run]
USAGE
}

CORS_ORIGIN=
REQUIRE_TLS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cors-origin) CORS_ORIGIN=${2:?}; shift 2 ;;
    --require-tls) REQUIRE_TLS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

require_cmd terraform
require_cmd ssh
require_cmd curl
SERVER_IP="$(tf_output server_ip)"
PUBLIC_API_DOMAIN="$(tf_output public_api_domain)"

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "Verify backend runtime"
  info "skipped in dry-run"

  step "Verify public API"
  info "skipped in dry-run"

  if [[ "$REQUIRE_TLS" -eq 1 ]]; then
    step "Verify TLS certificate"
    info "skipped in dry-run"
  fi
  exit 0
fi

step "Verify backend runtime"
run_ssh_massops_script "$SERVER_IP" '
printf "local backend health: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health)"
if [[ "$http_status" == "200" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf "systemd service active: "
if sudo systemctl is-active --quiet masswhisper-topic; then
  echo ok
else
  echo fail
  exit 1
fi

printf "cron service active: "
if sudo systemctl is-active --quiet cron; then
  echo ok
else
  echo fail
  exit 1
fi

printf "published bundle present: "
if sudo test -s /var/lib/masswhisper/read-api/daily-bundle.json; then
  echo ok
else
  echo fail
  exit 1
fi
'

step "Verify public API"
if [[ "$REQUIRE_TLS" -eq 1 ]]; then
  printf 'public api health reachable: '
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/health")"
  if [[ "$http_status" == "200" ]]; then
    echo ok
  else
    echo fail
    exit 1
  fi

  printf 'public api daily reachable: '
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/daily")"
  if [[ "$http_status" == "200" ]]; then
    echo ok
  else
    echo fail
    exit 1
  fi
else
  printf 'public api health reachable: '
  http_status_ip="$(curl -sS -o /dev/null -w '%{http_code}' "http://$SERVER_IP/health")"
  http_status_domain="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/health")"
  if [[ "$http_status_ip" == "200" || "$http_status_domain" == "200" ]]; then
    echo ok
  else
    echo fail
    exit 1
  fi

  printf 'public api daily reachable: '
  http_status_ip="$(curl -sS -o /dev/null -w '%{http_code}' "http://$SERVER_IP/daily")"
  http_status_domain="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/daily")"
  if [[ "$http_status_ip" == "200" || "$http_status_domain" == "200" ]]; then
    echo ok
  else
    echo fail
    exit 1
  fi
fi

if [[ -n "$CORS_ORIGIN" ]]; then
  printf 'expected CORS origin allowed: '
  if curl -sS -o /dev/null -D - -H "Origin: $CORS_ORIGIN" "https://$PUBLIC_API_DOMAIN/daily" | grep -qi "access-control-allow-origin: $CORS_ORIGIN"; then
    echo ok
  else
    echo fail
    exit 1
  fi
fi

if [[ "$REQUIRE_TLS" -eq 1 ]]; then
  step "Verify TLS certificate"
  printf 'http redirects to https: '
  http_status="$(curl -sS -o /dev/null -w '%{http_code}' "http://$PUBLIC_API_DOMAIN/health")"
  if [[ "$http_status" == "301" ]]; then
    echo ok
  else
    echo fail
    exit 1
  fi

  info "presented certificate:"
  openssl s_client -connect "$PUBLIC_API_DOMAIN:443" -servername "$PUBLIC_API_DOMAIN" </dev/null 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates
fi
