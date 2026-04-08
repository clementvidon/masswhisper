locals {
  app_name          = "masswhisper"
  server_name       = "${local.app_name}-api-${var.topic_manifest.topic_slug}-${var.topic_manifest.environment}"
  ssh_key_name      = "${local.app_name}-ops-key"
  ssh_public_key    = trimspace(var.ssh_public_key)
  public_api_domain = "api.${var.topic_manifest.domain}"
  topic_runtime_env = <<-EOT
  TOPIC_SLUG='${var.topic_manifest.topic_slug}'
  READ_API_DAILY_BUNDLE_PATH='/var/lib/masswhisper/read-api/daily-bundle.json'
  TOPIC_PROMPT_VARIANT='${var.topic_manifest.prompt_variant}'
  TOPIC_PROMPT_BUNDLE_PATH='/etc/masswhisper/prompts/${var.topic_manifest.prompt_variant}.json'
  TOPIC_SOURCES_VARIANT='${var.topic_manifest.sources_variant}'
  TOPIC_SOURCES_BUNDLE_PATH='/etc/masswhisper/sources/${var.topic_manifest.sources_variant}.json'
  EOT

  cloud_init_vars = {
    node_version      = "22.22.2"
    node_arch         = "linux-x64"
    service_user      = local.app_name
    admin_user        = "massops"
    repo_url          = "https://github.com/clementvidon/masswhisper"
    repo_dir          = "/opt/masswhisper"
    service_name      = "masswhisper-topic"
    capture_schedule  = var.topic_manifest.schedule
    topic_runtime_env = local.topic_runtime_env
    ssh_public_key    = local.ssh_public_key
    public_api_domain = local.public_api_domain

    nginx_public_api_conf = templatefile(
      "${path.module}/../../deploy/proxy/public-api.conf.tftpl",
      { public_api_domain = local.public_api_domain }
    )

    nginx_public_api_tls_conf = templatefile(
      "${path.module}/../../deploy/proxy/public-api.tls.conf.tftpl",
      { public_api_domain = local.public_api_domain }
    )
  }
}

resource "hcloud_ssh_key" "default" {
  name       = local.ssh_key_name
  public_key = local.ssh_public_key
}

resource "hcloud_firewall" "public_http" {
  name = "${local.server_name}-public-http"

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "22"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "allow ssh"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "80"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "allow http"
  }

  rule {
    direction   = "in"
    protocol    = "tcp"
    port        = "443"
    source_ips  = ["0.0.0.0/0", "::/0"]
    description = "allow https"
  }
}

resource "hcloud_server" "vm" {
  name        = local.server_name
  server_type = var.server_type
  location    = var.server_location
  image       = var.server_image

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", local.cloud_init_vars)

  ssh_keys     = [hcloud_ssh_key.default.id]
  firewall_ids = [hcloud_firewall.public_http.id]

  public_net {
    ipv4_enabled = true
    ipv6_enabled = false
  }
}
