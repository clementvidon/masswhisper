variable "topic_backend" {
  description = "Declarative backend instance input derived from an instance manifest."

  type = object({
    topic_slug      = string
    topic_name      = string
    environment     = string
    schedule        = string
    sources         = list(object({
      kind  = string
      url   = string
    }))
    prompt_variant  = string
    database_name   = string
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

variable "ssh_key_name" {
  description = "Hetzner SSH key resource name."
  type        = string
  default     = "masswhisper-key"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key uploaded to Hetzner."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
