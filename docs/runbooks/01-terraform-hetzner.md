# 01 Terraform Hetzner Runbook

This runbook provisions a Hetzner VM for the `masswhisper backend` and bootstraps the machine with cloud-init.

Estimated hands-on time: 5 minutes

It assumes:

- Terraform is installed locally
- a valid Hetzner Cloud API token already exists
- the topic manifest already exists

Operator variables:

```zsh
export TOPIC_SLUG=fr-dev-job-market
export ENVIRONMENT=prod
export LOCAL_TOPIC_CONFIG_DIR=$HOME/projects/masswhisper/local/assets/topic-config
```

`LOCAL_TOPIC_CONFIG_DIR` must follow the format documented in `docs/topic-config.md`.

## 1. Securely Export The Hetzner Token

Terraform reads the Hetzner cloud api token from the shell environment.

```zsh
export HCLOUD_TOKEN="$(pass show masswhisper/infra/hcloud/token)"
```

## 2. Generate The Terraform Input

```zsh
npm run generate-topic-tf-input -- instances/$TOPIC_SLUG/$ENVIRONMENT.yaml "$LOCAL_TOPIC_CONFIG_DIR"
```

## 3. Initialize Terraform

```zsh
terraform -chdir=infra/terraform init
```

## 4. Review The Plan And Apply

```zsh
terraform -chdir=infra/terraform apply -var-file="generated/${TOPIC_SLUG}-${ENVIRONMENT}.tfvars.json"
```

Expected result:

- the Hetzner `firewall`, `server`, and `SSH` key are created or updated as needed
- the server public `IPv4` is exposed as an output
- the backend `public_api_domain` is exposed as an output
- inbound tcp `22`, `80`, and `443` are allowed

## 5. Verify Cloud-Init Output

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh-keygen -R $server_ip >/dev/null 2>/dev/null
ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new "massops@$server_ip" '
  sudo cloud-init status --wait

  echo "[cloud-init] prepare ops user"
  printf "ops user: "; id -u massops >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }
  printf "ops authorized key: "; test -s /home/massops/.ssh/authorized_keys && echo ok || { echo fail; exit 1; }
  printf "ops sudoers file: "; sudo test -s /etc/sudoers.d/90-massops && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] install Node"
  printf "node: "; node -v >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }
  printf "npm: "; npm -v >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] bootstrap repo"
  printf "user: "; id -u masswhisper >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }
  printf "repo: "; test -d /opt/masswhisper && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] prepare runtime"
  printf "env: "; sudo test -f /etc/masswhisper/backend.env && echo ok || { echo fail; exit 1; }
  printf "topic runtime env: "; sudo test -f /etc/masswhisper/topic-runtime.env && echo ok || { echo fail; exit 1; }
  printf "unit: "; sudo test -s /etc/systemd/system/masswhisper-topic.service && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] prepare scheduler"
  printf "capture wrapper installed: "; test -x /usr/local/bin/run-capture.sh && echo ok || { echo fail; exit 1; }
  printf "runtime dir exists: "; sudo test -d /run/masswhisper && echo ok || { echo fail; exit 1; }
  printf "cron file installed: "; sudo test -s /etc/cron.d/masswhisper-topic && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] harden ssh"
  printf "ssh drop-in installed: "; sudo test -f /etc/ssh/sshd_config.d/99-masswhisper.conf && echo ok || { echo fail; exit 1; }
  printf "sshd config valid: "; sudo sshd -t >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] configure Nginx"
  printf "nginx site: "; sudo test -s /etc/nginx/sites-available/public-api.conf && echo ok || { echo fail; exit 1; }
  printf "nginx link: "; sudo test -L /etc/nginx/sites-enabled/public-api.conf && echo ok || { echo fail; exit 1; }
  printf "nginx config: "; sudo nginx -t >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }

  echo "[cloud-init] configure certbot"
  printf "certbot installed: "; certbot --version >/dev/null 2>&1 && echo ok || { echo fail; exit 1; }
  printf "acme webroot exists: "; sudo test -d /var/www/certbot/.well-known/acme-challenge && echo ok || { echo fail; exit 1; }
'
```

If the step fails, inspect the cloud-init logs first:

```zsh
server_ip="$(terraform -chdir=infra/terraform output -raw server_ip)"
ssh "massops@$server_ip" 'sudo journalctl -u cloud-init -u cloud-final -n 40'
```

If cloud-init must be replayed after a template fix, recreate the server:

```zsh
terraform -chdir=infra/terraform apply -replace=hcloud_server.vm \
  -var-file="generated/${TOPIC_SLUG}-${ENVIRONMENT}.tfvars.json"
```

## State After This Runbook

- the VM exists
- SSH access works
- the backend runtime is bootstrapped
- secrets, migrations, and service start are still manual

Next step:

- follow `docs/runbooks/02-backend-post-boot.md` to complete the backend setup
