variable "topic_manifest" {
  description = "Terraform input derived from the topic manifest."

  type = object({
    topic_slug      = string
    environment     = string
    schedule        = string
    sources_variant = string
    prompt_variant  = string
    domain          = string
  })
}

variable "server_type" {
  description = "Hetzner server type."
  type        = string
  default     = "cx23"
}

variable "server_location" {
  description = "Hetzner server location."
  type        = string
  default     = "nbg1"
}

variable "server_image" {
  description = "Hetzner image name."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key uploaded to Hetzner."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
