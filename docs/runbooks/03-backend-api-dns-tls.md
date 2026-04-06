# 03 - Backend API DNS And TLS Runbook

This runbook attaches the dedicated `public_api_domain` to the already bootstrapped backend VM and enables TLS on the public API.

Estimated hands-on time: 5 minutes

It assumes:

- the Terraform and backend VM post-boot runbooks are already completed
- the backend is healthy on the VM
- the DNS zone of the dedicated deployment is under control
- only an `A` record is used for now
- the Hetzner firewall already allows inbound tcp `443`
- `certbot` is already installed on the VM
- `/var/www/certbot/.well-known/acme-challenge` already exists on the VM
- the final TLS Nginx config template exists in `deploy/proxy/`

Operator variables:

```zsh
export CERTBOT_EMAIL=cvidon@student.42.fr
```

This runbook uses `certbot certonly --webroot`, so Certbot issues the certificate without editing the Nginx configuration. HTTPS and the public read API routes are enabled explicitly in step 7.

## 1. Create The DNS A Record

Create an `A` record pointing the dedicated `public_api_domain` to the server IPv4 address.

- Type: `A`
- Host: the full hostname or the zone-relative label for `public_api_domain`
- Target: the current Terraform `server_ip`
- TTL: `300`

Current Terraform server IP:

```zsh
terraform -chdir=infra/terraform output server_ip
```

In this deployment design, the public API hostname is expected to be `api.<domain>`.
If the DNS zone is `masswhisper.com` and `domain=fr-dev-job-market.masswhisper.com`,
the relative label may be `api.fr-dev-job-market` rather than only `api`.

## 2. Verify DNS Resolution

Verify that public DNS resolvers return the expected IPv4 address.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"

printf "cloudflare A record matches server IPv4: "
dig +short A "$public_api_domain" @1.1.1.1 | grep -qx "$server_ip" && echo ok || { echo fail; exit 1; }

printf "google A record matches server IPv4: "
dig +short A "$public_api_domain" @8.8.8.8 | grep -qx "$server_ip" && echo ok || { echo fail; exit 1; }
```

If both checks fail, wait a few minutes for DNS propagation and retry.

## 3. Simulate ACME HTTP-01 Challenge

Simulate the ACME HTTP-01 challenge to verify that the webroot is publicly accessible.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  printf ok > /var/www/certbot/.well-known/acme-challenge/ping
'

public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
printf "acme challenge served over http: "
curl -s "http://$public_api_domain/.well-known/acme-challenge/ping" \
  | grep -qx ok && echo ok || { echo fail; exit 1; }
```

This is the required preflight check.
If it fails, stop here and fix DNS, HTTP reachability, or the Nginx ACME webroot before continuing.

## 4. Validate ACME HTTP-01 Challenge (Staging)

Request a staging certificate from Let's Encrypt in a separate Certbot lineage to validate the ACME HTTP-01 challenge end-to-end without hitting production rate limits.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
staging_cert_name="$public_api_domain-staging"
ssh "root@$server_ip" "
  set -eu
  certbot certonly --test-cert --non-interactive --agree-tos --no-eff-email -m \"$CERTBOT_EMAIL\" \
    --cert-name \"$staging_cert_name\" \
    --webroot -w /var/www/certbot -d \"$public_api_domain\"
"

ssh "root@$server_ip" "
  printf 'staging certificate issued: '
  openssl x509 -in \"/etc/letsencrypt/live/$staging_cert_name/fullchain.pem\" -noout -issuer \
    | grep -q \"(STAGING) Let's Encrypt\" && echo ok || { echo fail; exit 1; }
"
```

## 5. Issue Production TLS Certificate

Request and install a production TLS certificate from Let's Encrypt using the ACME HTTP-01 challenge.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
ssh "root@$server_ip" "
  set -eu
  certbot certonly --non-interactive --agree-tos --no-eff-email -m "$CERTBOT_EMAIL" \
    --cert-name \"$public_api_domain\" \
    --webroot -w /var/www/certbot -d \"$public_api_domain\"
"

ssh "root@$server_ip" "
  printf 'production certificate issued: '
  openssl x509 -in \"/etc/letsencrypt/live/$public_api_domain/fullchain.pem\" -noout -issuer \
    | grep -q \"O = Let's Encrypt\" && ! grep -q \"(STAGING)\" && echo ok || { echo fail; exit 1; }
"
```

Rerun: keep the existing production certificate until renewal is due.
The staging validation uses a separate Certbot lineage and does not require `--force-renewal`.

## 6. Install The Renewal Reload Hook

Add a Certbot deploy hook to reload Nginx after each certificate renewal.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  printf "%s\n" "#!/bin/sh" "systemctl reload nginx" > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
'

ssh "root@$server_ip" '
  printf "certbot deploy hook installed: "
  test -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  grep -qx "systemctl reload nginx" /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  echo ok || { echo fail; exit 1; }
'
```

## 7. Activate The Final TLS Nginx Config

Activate the final TLS-enabled Nginx configuration and reload the server.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
  nginx -t
  systemctl reload nginx
'

ssh "root@$server_ip" '
  printf "nginx TLS config active: "
  nginx -t >/dev/null 2>&1 && \
  grep -q "ssl_certificate" /etc/nginx/sites-available/public-api.conf && \
  echo ok || { echo fail; exit 1; }
'
```

## 8. Verify Public HTTP Redirect And HTTPS Read Routing

Verify that HTTP requests are redirected to HTTPS and that routing behaves as expected.

```zsh
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
printf "http redirects to https: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "http://$public_api_domain/health")"
[[ "$http_status" == "301" ]] && echo ok || { echo fail; exit 1; }

printf "https health endpoint reachable: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$public_api_domain/health")"
[[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }

printf "https daily endpoint reachable: "
http_status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$public_api_domain/daily")"
[[ "$http_status" == "200" ]] && echo ok || { echo fail; exit 1; }
```

## 9. Inspect The Presented Certificate

```zsh
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
openssl s_client -connect "$public_api_domain:443" -servername "$public_api_domain" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Confirm that:

- the certificate subject contains the current `public_api_domain`
- the certificate is not expired
- the issuer is Let’s Encrypt production, not staging

## 10. Verify Automatic Renewal

Dry-run renewal to ensure certificates can be renewed automatically.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'certbot renew --dry-run --no-random-sleep-on-renew -v'
```

## Fallback If DNS Is Not Ready

Use a temporary hostname if the final domain cannot be updated yet.

If the current `public_api_domain` cannot be pointed yet, use a temporary hostname under the same controlled DNS zone and repeat the same process with that name.

## State After This Runbook

- the current `public_api_domain` resolves to the backend VM IPv4
- HTTP redirects to HTTPS
- the API presents a valid TLS certificate
- `/health` and `/daily` respond on the public HTTPS API
- certificate renewal is testable

Next step:

- go back to `docs/runbooks/02-backend-post-boot.md` step 13

## Appendix

### Back Up the Issued Certificate

After the production certificate is issued, save the full Let's Encrypt state locally.

Choose a secure local backup directory that is not committed to Git.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
backup_dir="$HOME/.local/share/masswhisper/tls-backups/$public_api_domain"
umask 077

mkdir -p "$backup_dir"
rsync -a "root@$server_ip:/etc/letsencrypt/" "$backup_dir/letsencrypt/"
```

This preserves:

- `live/`
- `archive/`
- `renewal/`
- Certbot account metadata

### Restore a Saved Certificate to a Rebuilt VM

If the VM was rebuilt and a production certificate backup already exists locally, restore it before trying to issue a new certificate.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
backup_dir="$HOME/.local/share/masswhisper/tls-backups/$public_api_domain"

test -d "$backup_dir/letsencrypt" || { echo "missing local certificate backup"; exit 1; }

rsync -a "$backup_dir/letsencrypt/" "root@$server_ip:/etc/letsencrypt/"

ssh "root@$server_ip" '
  set -eu
  chown -R root:root /etc/letsencrypt
  find /etc/letsencrypt -type d -exec chmod 755 {} \;
  find /etc/letsencrypt -type f -exec chmod 644 {} \;
  find /etc/letsencrypt/archive -type f -exec chmod 600 {} \;
  nginx -t
  systemctl reload nginx
'
```

### Verify the Restored Certificate

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
ssh "root@$server_ip" "openssl x509 -in '/etc/letsencrypt/live/$public_api_domain/fullchain.pem' -noout -subject -issuer -dates"
```
