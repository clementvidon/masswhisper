#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
source "$SCRIPT_DIR/common.sh"

usage() {
  cat <<USAGE
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
run_ssh_root_script "$SERVER_IP" '
set -eu
printf ok > /var/www/certbot/.well-known/acme-challenge/ping
'

printf 'acme challenge served over http: '
if curl -s "http://$PUBLIC_API_DOMAIN/.well-known/acme-challenge/ping" | grep -qx ok; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.4 Validate ACME HTTP-01 challenge (staging)"
run_ssh_root_script "$SERVER_IP" "
set -eu
certbot certonly --test-cert --non-interactive --agree-tos --no-eff-email -m '$CERTBOT_EMAIL' \
  --webroot -w /var/www/certbot -d '$PUBLIC_API_DOMAIN'
"

printf 'staging certificate issued: '
if ssh "root@$SERVER_IP" "openssl x509 -in '/etc/letsencrypt/live/$PUBLIC_API_DOMAIN/fullchain.pem' -noout -issuer | grep -q \"(STAGING) Let's Encrypt\""; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.5 Issue production TLS certificate"
run_ssh_root_script "$SERVER_IP" "
set -eu
certbot certonly --keep-until-expiring --non-interactive --agree-tos --no-eff-email -m '$CERTBOT_EMAIL' \
  --webroot -w /var/www/certbot -d '$PUBLIC_API_DOMAIN'
"

printf 'production certificate issued: '
if ssh "root@$SERVER_IP" "openssl x509 -in '/etc/letsencrypt/live/$PUBLIC_API_DOMAIN/fullchain.pem' -noout -issuer | grep -q \"O = Let's Encrypt\""; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.6 Install the renewal reload hook"
run_ssh_root_script "$SERVER_IP" '
set -eu
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
printf "%s\n" "#!/bin/sh" "systemctl reload nginx" > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
'

printf 'certbot deploy hook installed: '
if ssh "root@$SERVER_IP" "test -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && grep -qx 'systemctl reload nginx' /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.7 Activate the final TLS Nginx config"
run_ssh_root_script "$SERVER_IP" '
set -eu
install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
nginx -t
systemctl reload nginx
'

printf 'nginx TLS config active: '
if ssh "root@$SERVER_IP" "nginx -t >/dev/null 2>&1 && grep -q 'ssl_certificate' /etc/nginx/sites-available/public-api.conf"; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.8 Verify public HTTP redirect and HTTPS read routing"
printf 'http redirects to https: '
if curl -s -i "http://$PUBLIC_API_DOMAIN/health" | grep -Eq '^HTTP/[0-9.]+ 301'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'https health endpoint reachable: '
if curl -s -i "https://$PUBLIC_API_DOMAIN/health" | grep -Eq '^HTTP/[0-9.]+ 200'; then
  echo ok
else
  echo fail
  exit 1
fi

printf 'https daily endpoint reachable: '
if curl -s -i "https://$PUBLIC_API_DOMAIN/daily" | grep -Eq '^HTTP/[0-9.]+ 200'; then
  echo ok
else
  echo fail
  exit 1
fi

step "03.9 Inspect the presented certificate"
openssl s_client -connect "$PUBLIC_API_DOMAIN:443" -servername "$PUBLIC_API_DOMAIN" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

step "03.10 Verify automatic renewal"
run_ssh_root_script "$SERVER_IP" '
certbot renew --dry-run --no-random-sleep-on-renew -v
'
