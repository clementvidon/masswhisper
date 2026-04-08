output "server_ip" {
  value = hcloud_server.vm.ipv4_address
}

output "public_api_domain" {
  value = local.public_api_domain
}

output "topic_runtime_env" {
  # Non-sensitive only. This output is stored in Terraform state.
  value = local.topic_runtime_env
}
