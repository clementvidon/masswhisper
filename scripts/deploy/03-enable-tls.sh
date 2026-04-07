#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"
enable_error_trace

usage() {
  cat <<'USAGE'
Usage:

  scripts/deploy/03-enable-tls.sh \
    --certbot-email <email> \
    [--dry-run]
USAGE
}

CERTBOT_EMAIL=

while [[ $# -gt 0 ]]; do
  case "$1" in
    --certbot-email) CERTBOT_EMAIL=${2:?}; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown argument: $1" ;;
  esac
done

[[ -n "$CERTBOT_EMAIL" ]] || { usage; fail "--certbot-email is required"; }

require_cmd terraform
require_cmd ssh
require_cmd curl
require_cmd dig
require_cmd openssl

SERVER_IP="$(tf_output server_ip)"
PUBLIC_API_DOMAIN="$(tf_output public_api_domain)"
STAGING_CERT_NAME="${PUBLIC_API_DOMAIN}-staging"

step "03.1 Create the DNS A record"
info "Type:   A"
info "Host:   $PUBLIC_API_DOMAIN"
info "Target: $SERVER_IP"
info "TTL:    300"

if [[ "$DRY_RUN" -eq 1 ]]; then
  step "03.2 Verify DNS resolution"
  info "skipped in dry-run"

  step "03.3 Simulate ACME HTTP-01 challenge"
  info "skipped in dry-run"

  step "03.4 Validate ACME HTTP-01 challenge (staging)"
  info "skipped in dry-run"

  step "03.5 Issue production TLS certificate"
  info "skipped in dry-run"

  step "03.6 Install the renewal reload hook"
  info "skipped in dry-run"

  step "03.7 Activate the final TLS Nginx config"
  info "skipped in dry-run"

  step "03.8 Verify public HTTP redirect and HTTPS read routing"
  info "skipped in dry-run"

  step "03.9 Inspect the presented certificate"
  info "skipped in dry-run"

  step "03.10 Verify automatic renewal"
  info "skipped in dry-run"
  exit 0
fi

step "03.2 Verify DNS resolution"
printf 'cloudflare A record matches server IPv4: '
if dig +short A "$PUBLIC_API_DOMAIN" @1.1.1.1 | grep -qx "$SERVER_IP"; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'google A record matches server IPv4: '
if dig +short A "$PUBLIC_API_DOMAIN" @8.8.8.8 | grep -qx "$SERVER_IP"; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.3 Simulate ACME HTTP-01 challenge"
run_ssh_massops_script "$SERVER_IP" '
set -eu
printf ok | sudo tee /var/www/certbot/.well-known/acme-challenge/ping >/dev/null
'

printf 'acme challenge served over http: '
if curl -s "http://$PUBLIC_API_DOMAIN/.well-known/acme-challenge/ping" | grep -qx ok; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.4 Validate ACME HTTP-01 challenge (staging)"
current_issuer="$(ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo openssl x509 -in '/etc/letsencrypt/live/$STAGING_CERT_NAME/fullchain.pem' -noout -issuer 2>/dev/null || true")"

if grep -q "(STAGING) Let's Encrypt" <<<"$current_issuer"; then
    printf 'staging certificate issued: '
    echo "ok (staging certificate already present)"
else
  run_ssh_massops_script "$SERVER_IP" '
set -eu
CERTBOT_EMAIL='"$CERTBOT_EMAIL"'
PUBLIC_API_DOMAIN='"$PUBLIC_API_DOMAIN"'
STAGING_CERT_NAME='"$STAGING_CERT_NAME"'
sudo certbot certonly --test-cert --non-interactive --agree-tos --no-eff-email -m "$CERTBOT_EMAIL" \
  --cert-name "$STAGING_CERT_NAME" \
  --webroot -w /var/www/certbot -d "$PUBLIC_API_DOMAIN"
'
  printf 'staging certificate issued: '
  current_issuer="$(ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo openssl x509 -in '/etc/letsencrypt/live/$STAGING_CERT_NAME/fullchain.pem' -noout -issuer")"
  if grep -q "(STAGING) Let's Encrypt" <<<"$current_issuer"; then
    echo ok
  else
    fail "staging certificate issued: fail"
  fi
fi

step "03.5 Issue production TLS certificate"
current_issuer="$(ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo openssl x509 -in '/etc/letsencrypt/live/$PUBLIC_API_DOMAIN/fullchain.pem' -noout -issuer 2>/dev/null || true")"

printf 'production certificate issued: '
if grep -q "O = Let's Encrypt" <<<"$current_issuer" && ! grep -q "(STAGING)" <<<"$current_issuer"; then
  echo "ok (production certificate already present)"
else
  run_ssh_massops_script "$SERVER_IP" '
set -eu
CERTBOT_EMAIL='"$CERTBOT_EMAIL"'
PUBLIC_API_DOMAIN='"$PUBLIC_API_DOMAIN"'
sudo certbot certonly --non-interactive --agree-tos --no-eff-email -m "$CERTBOT_EMAIL" \
  --cert-name "$PUBLIC_API_DOMAIN" \
  --webroot -w /var/www/certbot -d "$PUBLIC_API_DOMAIN"
'
  current_issuer="$(ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo openssl x509 -in '/etc/letsencrypt/live/$PUBLIC_API_DOMAIN/fullchain.pem' -noout -issuer")"
  if grep -q "O = Let's Encrypt" <<<"$current_issuer" && ! grep -q "(STAGING)" <<<"$current_issuer"; then
    echo ok
  else
    fail "production certificate issued: fail"
  fi
fi

step "03.6 Install the renewal reload hook"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf "%s\n" "#!/bin/sh" "systemctl reload nginx" | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
'

printf 'certbot deploy hook installed: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo test -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && sudo grep -qx 'systemctl reload nginx' /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.7 Activate the final TLS Nginx config"
run_ssh_massops_script "$SERVER_IP" '
set -eu
sudo install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
sudo nginx -t
sudo systemctl reload nginx
'

printf 'nginx TLS config active: '
if ssh "${SSH_OPTS[@]}" "massops@$SERVER_IP" "sudo nginx -t >/dev/null 2>&1 && sudo grep -q 'ssl_certificate' /etc/nginx/sites-available/public-api.conf"; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.8 Verify public HTTP redirect and HTTPS read routing"
printf 'http redirects to https: '
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "http://$PUBLIC_API_DOMAIN/health")"
if [[ "$http_status" == "301" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'https health endpoint reachable: '
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/health")"
if [[ "$http_status" == "200" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'https daily endpoint reachable: '
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$PUBLIC_API_DOMAIN/daily")"
if [[ "$http_status" == "200" ]]; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.9 Inspect the presented certificate"
openssl s_client -connect "$PUBLIC_API_DOMAIN:443" -servername "$PUBLIC_API_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

step "03.10 Verify automatic renewal with a dry run"
run_ssh_massops_script "$SERVER_IP" '
sudo certbot renew --dry-run --no-random-sleep-on-renew -v
'
