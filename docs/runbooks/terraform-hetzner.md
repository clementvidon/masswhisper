# Terraform Hetzner Runbook

This runbook provisions a Hetzner VM for the `masswhisper backend` and bootstraps the machine with cloud-init.

It assumes:

- Terraform is installed locally
- a valid Hetzner Cloud API token already exists
- the topic manifest already exists

## 1. Export The Hetzner Token

Terraform reads the Hetzner cloud api token from the shell environment.

Secure approach example:

```bash
export HCLOUD_TOKEN="$(pass show masswhisper/infra/hcloud/token)"
```

## 2. Generate The Terraform Input

```bash
npm run generate-topic-tf-input -- instances/fr-dev-job-market/prod.yaml
```

## 3. Initialize Terraform

```bash
terraform -chdir=infra/terraform init
```

## 4. Review The Plan

```bash
terraform -chdir=infra/terraform plan \
  -var-file=generated/fr-dev-job-market-prod.tfvars.json
```

Expected result:

- the Hetzner `firewall`, `SSH` key, and `server` are created or updated as needed
- the server public `IPv4` is exposed as an output
- inbound tcp `22`, `80`, and `443` are allowed

## 5. Apply The Plan

```bash
terraform -chdir=infra/terraform apply \
  -var-file=generated/fr-dev-job-market-prod.tfvars.json
```

Expected result:

- the VM exists after apply
- the server public IPv4 is available in the Terraform outputs

## 6. Verify Cloud-Init Output

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" '

  echo "[cloud-init] prepare ops user"
  printf "ops user: "; id -u massops >/dev/null 2>&1 && echo ok || echo fail
  printf "ops authorized key: "; test -s /home/massops/.ssh/authorized_keys && echo ok || echo fail
  printf "ops sudoers file: "; test -s /etc/sudoers.d/90-massops && echo ok || echo fail

  echo "[cloud-init] install Node"
  printf "node: "; node -v 2>/dev/null || echo fail
  printf "npm: "; npm -v 2>/dev/null || echo fail

  echo "[cloud-init] bootstrap repo"
  printf "user: "; id -u masswhisper >/dev/null 2>&1 && echo ok || echo fail
  printf "repo: "; test -d /opt/masswhisper && echo ok || echo fail

  echo "[cloud-init] prepare runtime"
  printf "env: "; test -f /etc/masswhisper/backend.env && stat -c "%U:%G %a %n" /etc/masswhisper/backend.env || echo fail
  printf "unit: "; test -s /etc/systemd/system/masswhisper-topic.service && echo ok || echo fail

  echo "[cloud-init] prepare scheduler"
  printf "capture wrapper installed: "; test -x /usr/local/bin/run-capture.sh && echo ok || echo fail
  printf "cron file installed: "; test -s /etc/cron.d/masswhisper-topic && echo ok || echo fail

  echo "[cloud-init] harden ssh"
  printf "ssh drop-in installed: "; test -f /etc/ssh/sshd_config.d/99-masswhisper.conf && echo ok || echo fail
  printf "sshd config valid: "; sshd -t >/dev/null 2>&1 && echo ok || echo fail

  echo "[cloud-init] configure Nginx"
  printf "nginx site: "; test -s /etc/nginx/sites-available/api.masswhisper.com.conf && echo ok || echo fail
  printf "nginx link: "; test -L /etc/nginx/sites-enabled/api.masswhisper.com.conf && echo ok || echo fail
  printf "nginx config: "; nginx -t >/dev/null 2>&1 && echo ok || echo fail

  echo "[cloud-init] configure certbot"
  printf "certbot installed: "; certbot --version >/dev/null 2>&1 && echo ok || echo fail
  printf "acme webroot exists: "; test -d /var/www/certbot/.well-known/acme-challenge && echo ok || echo fail
'
```

If the step fails, inspect the cloud-init logs first:

```bash
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "root@$server_ip" 'journalctl -u cloud-init -u cloud-final -n 40'
```

If cloud-init must be replayed after a template fix, recreate the server:

```bash
terraform -chdir=infra/terraform apply -replace=hcloud_server.vm \
  -var-file=generated/fr-dev-job-market-prod.tfvars.json
```

## State After This Runbook

- the VM exists
- SSH access works
- the backend runtime is bootstrapped
- secrets, migrations, and service start are still manual

Next step:

- follow `docs/runbooks/backend-post-boot.md` to complete the backend setup
