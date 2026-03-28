# Backend API DNS And TLS Runbook

This runbook attaches `api.masswhisper.com` to the already bootstrapped backend VM and enables TLS on the public API.

It assumes:

- the Terraform and backend VM post-boot runbooks are already completed
- the backend is healthy on the VM
- the DNS zone for `masswhisper.com` is under control
- only an `A` record is used for now
- the Hetzner firewall already allows inbound tcp `443`
- `certbot` is already installed on the VM
- `/var/www/certbot/.well-known/acme-challenge` already exists on the VM
- the final TLS Nginx config exists at `deploy/proxy/api.masswhisper.com.tls.conf`

This runbook uses `certbot certonly --webroot`, so Certbot issues the certificate without editing the Nginx configuration. HTTPS is enabled explicitly in step 7.

## 1. Create The DNS A Record

Create an `A` record pointing `api.masswhisper.com` to the server IPv4 address.

- type: `A`
- name: `api`
- value: the current Terraform `server_ip`
- TTL: `300`

Get the server IP:

```bash
terraform -chdir=infra/terraform output server_ip
```

## 2. Verify DNS Resolution

Verify that public DNS resolvers return the expected IPv4 address.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"

printf "cloudflare A record matches server IPv4: "
dig +short A api.masswhisper.com @1.1.1.1 | grep -qx "$server_ip" && echo "ok" || echo "fail"

printf "google A record matches server IPv4: "
dig +short A api.masswhisper.com @8.8.8.8 | grep -qx "$server_ip" && echo "ok" || echo "fail"
```

If both checks fail, wait a few minutes for DNS propagation and retry.

## 3. Simulate ACME HTTP-01 Challenge

Simulate the ACME HTTP-01 challenge to verify that the webroot is publicly accessible.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  printf ok > /var/www/certbot/.well-known/acme-challenge/ping

  printf "acme challenge served over http: "
  curl -s "http://api.masswhisper.com/.well-known/acme-challenge/ping" \
    | grep -qx "ok" && echo "ok" || echo "fail"
'
```

This is the required preflight check.
If it fails, stop here and fix DNS, HTTP reachability, or the Nginx ACME webroot before continuing.

## 4. Validate ACME HTTP-01 Challenge (Staging)

Request a staging certificate from Let's Encrypt to validate the ACME HTTP-01 challenge end-to-end without hitting production rate limits.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
my_email='cvidon@student.42.fr'
ssh "root@$server_ip" "
  set -eu
  certbot certonly --test-cert --non-interactive --agree-tos --no-eff-email -m \"$my_email\" \
    --webroot -w /var/www/certbot -d api.masswhisper.com

  printf 'staging certificate issued: '
  openssl x509 -in /etc/letsencrypt/live/api.masswhisper.com/fullchain.pem -noout -issuer \
    | grep -q \"(STAGING) Let's Encrypt\" && echo ok || echo fail
"
```

## 5. Issue Production TLS Certificate

Request and install a production TLS certificate from Let's Encrypt using the ACME HTTP-01 challenge.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
my_email='cvidon@student.42.fr'
ssh "root@$server_ip" "
  set -eu
  certbot certonly --non-interactive --agree-tos --no-eff-email -m \"$my_email\" \
    --webroot -w /var/www/certbot -d api.masswhisper.com --force-renewal

  printf 'production certificate issued: '
  openssl x509 -in /etc/letsencrypt/live/api.masswhisper.com/fullchain.pem -noout -issuer \
    | grep -q \"O = Let's Encrypt\" && echo ok || echo fail
"
```

## 6. Install The Renewal Reload Hook

Add a Certbot deploy hook to reload Nginx after each certificate renewal.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  printf "%s\n" "#!/bin/sh" "systemctl reload nginx" > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
  chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

  printf "certbot deploy hook installed: "
  test -x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  grep -qx "systemctl reload nginx" /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && \
  echo ok || echo fail
'
```

## 7. Activate The Final TLS Nginx Config

Activate the final TLS-enabled Nginx configuration and reload the server.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '
  set -eu
  install -D -m 0644 /opt/masswhisper/deploy/proxy/api.masswhisper.com.tls.conf /etc/nginx/sites-available/api.masswhisper.com.conf
  nginx -t
  systemctl reload nginx

  printf "nginx TLS config active: "
  nginx -t >/dev/null 2>&1 && \
  grep -q "ssl_certificate" /etc/nginx/sites-available/api.masswhisper.com.conf && \
  echo ok || echo fail
'
```

## 8. Verify Public HTTP Redirect And HTTPS Routing

Verify that HTTP requests are redirected to HTTPS and that routing behaves as expected.

```bash
printf "http redirects to https: "
curl -s -i http://api.masswhisper.com/health \
  | grep -Eq "^HTTP/[0-9.]+ 301" && echo "ok" || echo "fail"

printf "https health endpoint reachable: "
curl -s -i https://api.masswhisper.com/health \
  | grep -Eq "^HTTP/[0-9.]+ 200" && echo "ok" || echo "fail"

printf "https report endpoint blocked: "
curl -s -i https://api.masswhisper.com/report \
  | grep -Eq "^HTTP/[0-9.]+ 404" && echo "ok" || echo "fail"
```

## 9. Inspect The Presented Certificate

```bash
openssl s_client -connect api.masswhisper.com:443 -servername api.masswhisper.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Confirm that:

- the certificate subject contains `api.masswhisper.com`
- the certificate is not expired
- the issuer is Let’s Encrypt production, not staging

## 10. Verify Automatic Renewal

Dry-run renewal to ensure certificates can be renewed automatically.

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'certbot renew --dry-run'
```

## Fallback If DNS Is Not Ready

Use a temporary hostname if the final domain cannot be updated yet.

If `api.masswhisper.com` cannot be pointed yet, use a temporary stable hostname such as `api-tmp.masswhisper.com` and repeat the same process with that name.

## State After This Runbook

- `api.masswhisper.com` resolves to the backend VM IPv4
- HTTP redirects to HTTPS
- the API presents a valid TLS certificate
- `/health` responds on the public HTTPS API
- `/report` stays blocked publicly
- certificate renewal is testable
