# 03 - Backend API DNS And TLS Runbook

This runbook attaches the dedicated `public_api_domain` to the already bootstrapped backend VM and enables TLS on the public API.

- points the API domain to the VM
- validates DNS and ACME challenge readiness
- issues and activates the TLS certificate
- verifies HTTPS exposure and renewal readiness

_Estimated hands-on time: 5 minutes_

It assumes:

- the Terraform and backend VM post-boot runbooks are already completed
- the backend is healthy on the VM
- root SSH login is already disabled and routine access goes through `massops`
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

This runbook uses `certbot certonly --webroot`, so Certbot issues the certificate without editing the Nginx configuration. HTTPS and the public read API routes are enabled explicitly in step 8.

If this VM was rebuilt and a certificate backup already exists, restore it in step 3 before requesting a new certificate.

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

## 3. Restore Saved TLS State Optional

If this VM was rebuilt and a production certificate backup already exists locally, restore the saved Let's Encrypt state before requesting new certificates.

Skip this step when no trusted local backup exists.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
backup_dir="$HOME/.local/share/masswhisper/tls-backups/$public_api_domain"

test -d "$backup_dir/letsencrypt" || { echo "missing local certificate backup"; exit 1; }

rsync -a --rsync-path="sudo rsync" \
  "$backup_dir/letsencrypt/" \
  "massops@$server_ip:/etc/letsencrypt/"

ssh "massops@$server_ip" "
  set -eu
  sudo chown -R root:root /etc/letsencrypt
  sudo find /etc/letsencrypt -type d -exec chmod 755 {} \;
  sudo find /etc/letsencrypt -type f -exec chmod 644 {} \;
  sudo find /etc/letsencrypt/archive -type f -exec chmod 600 {} \;
  sudo find /etc/letsencrypt/accounts -type f -exec chmod 600 {} \; 2>/dev/null || true
  referenced_accounts=\"\$(sudo sed -n \"s/^account[[:space:]]*=[[:space:]]*//p\" /etc/letsencrypt/renewal/*.conf 2>/dev/null | sort -u)\"
  for account_dir in /etc/letsencrypt/accounts/*/directory/*; do
    [ -d \"\$account_dir\" ] || continue
    account_id=\"\$(basename \"\$account_dir\")\"
    if ! printf \"%s\n\" \"\$referenced_accounts\" | grep -qx \"\$account_id\"; then
      sudo rm -rf \"\$account_dir\"
    fi
  done
  sudo openssl x509 -in \"/etc/letsencrypt/live/$public_api_domain/fullchain.pem\" -noout -checkend 86400 >/dev/null
"
```

The restore path must contain a `letsencrypt/` directory copied from `/etc/letsencrypt/`.

## 4. Simulate ACME HTTP-01 Challenge

Simulate the ACME HTTP-01 challenge to verify that the webroot is publicly accessible.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  printf ok | sudo tee /var/www/certbot/.well-known/acme-challenge/ping >/dev/null
'

public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
printf "acme challenge served over http: "
curl -s --resolve "$public_api_domain:80:$server_ip" \
  "http://$public_api_domain/.well-known/acme-challenge/ping" \
  | grep -qx ok && echo ok || { echo fail; exit 1; }

printf "acme challenge served over public DNS: "
curl -s "http://$public_api_domain/.well-known/acme-challenge/ping" \
  | grep -qx ok && echo ok || { echo fail; exit 1; }
```

This is the required preflight check.
If it fails, stop here and fix DNS, HTTP reachability, or the Nginx ACME webroot before continuing.

## 5. Validate ACME HTTP-01 Challenge (Staging)

Request a staging certificate from Let's Encrypt in a separate Certbot lineage to validate the ACME HTTP-01 challenge end-to-end without hitting production rate limits.
If the expected staging lineage is already present with a Let's Encrypt staging issuer, keep it and skip reissuing it.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
staging_cert_name="$public_api_domain-staging"
ssh "massops@$server_ip" "
  set -eu
  sudo certbot certonly --test-cert --non-interactive --agree-tos --no-eff-email -m \"$CERTBOT_EMAIL\" \
    --cert-name \"$staging_cert_name\" \
    --webroot -w /var/www/certbot -d \"$public_api_domain\"
"

ssh "massops@$server_ip" "
  printf 'staging certificate issued: '
  sudo openssl x509 -in \"/etc/letsencrypt/live/$staging_cert_name/fullchain.pem\" -noout -issuer \
    | grep -q \"(STAGING) Let's Encrypt\" && echo ok || { echo fail; exit 1; }
"
```

## 6. Issue Production TLS Certificate

Request and install a production TLS certificate from Let's Encrypt using the ACME HTTP-01 challenge.
If the existing production lineage already presents a valid Let's Encrypt production issuer, keep it and do not force reissuance.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
ssh "massops@$server_ip" "
  set -eu
  sudo certbot certonly --non-interactive --agree-tos --no-eff-email -m "$CERTBOT_EMAIL" \
    --cert-name \"$public_api_domain\" \
    --webroot -w /var/www/certbot -d \"$public_api_domain\"
"

ssh "massops@$server_ip" "
  printf 'production certificate issued: '
  issuer=\$(sudo openssl x509 -in \"/etc/letsencrypt/live/$public_api_domain/fullchain.pem\" -noout -issuer)
  printf '%s\n' \"\$issuer\" | grep -q \"O = Let's Encrypt\" &&
  printf '%s\n' \"\$issuer\" | grep -qv \"(STAGING)\" &&
  echo ok || { echo fail; exit 1; }
"
```

Rerun: keep the existing production certificate until renewal is due.
The staging validation uses a separate Certbot lineage and does not require `--force-renewal`.

## 7. Install The Renewal Reload Hook

Add a Certbot deploy hook to reload Nginx after each certificate renewal.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  printf "%s\n" "#!/bin/sh" "systemctl reload nginx" | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null
  sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
'

ssh "massops@$server_ip" '
  printf "certbot deploy hook installed: "
  sudo test -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  sudo grep -qx "systemctl reload nginx" /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  echo ok || { echo fail; exit 1; }
'
```

## 8. Activate The Final TLS Nginx Config

Activate the final TLS-enabled Nginx configuration and reload the server.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" '
  set -eu
  sudo install -D -m 0644 /etc/masswhisper/public-api.tls.conf /etc/nginx/sites-available/public-api.conf
  sudo nginx -t
  sudo systemctl reload nginx
'

ssh "massops@$server_ip" '
  printf "nginx TLS config active: "
  sudo nginx -t >/dev/null 2>&1 && \
  sudo grep -q "ssl_certificate" /etc/nginx/sites-available/public-api.conf && \
  echo ok || { echo fail; exit 1; }
'
```

## 9. Verify Public HTTP Redirect And HTTPS Read Routing

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

## 10. Inspect The Presented Certificate

```zsh
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
openssl s_client -connect "$public_api_domain:443" -servername "$public_api_domain" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Confirm that:

- the certificate subject contains the current `public_api_domain`
- the certificate is not expired
- the issuer is Let’s Encrypt production, not staging

## 11. Verify Automatic Renewal

Dry-run renewal to ensure certificates can be renewed automatically.

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
staging_cert_name="$public_api_domain-staging"
ssh "massops@$server_ip" "
  set -eu
  sudo test -s \"/etc/letsencrypt/renewal/$public_api_domain.conf\"
  sudo grep -Eq '^account[[:space:]]*=' \"/etc/letsencrypt/renewal/$public_api_domain.conf\"
  sudo certbot renew --cert-name \"$public_api_domain\" --dry-run --no-random-sleep-on-renew -v
  sudo rm -f \"/etc/letsencrypt/renewal/$staging_cert_name.conf\"
"
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
- staging certificates are excluded from automatic renewal

Next step:

- follow `docs/runbooks/04-frontend-dedicated-vercel.md` to deploy the dedicated frontend

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
rsync -a --rsync-path="sudo rsync" "massops@$server_ip:/etc/letsencrypt/" "$backup_dir/letsencrypt/"
```

This preserves:

- `live/`
- `archive/`
- `renewal/`
- Certbot account metadata

### Restore a Saved Certificate to a Rebuilt VM

Use step 3 before requesting staging or production certificates.

### Verify the Restored Certificate

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
public_api_domain="$(terraform -chdir=infra/terraform output -raw public_api_domain)"
ssh "massops@$server_ip" "sudo openssl x509 -in '/etc/letsencrypt/live/$public_api_domain/fullchain.pem' -noout -subject -issuer -dates"
```
