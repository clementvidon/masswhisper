output "public_api_domain" {
  value = local.public_api_domain
}

output "server_name" {
  value = hcloud_server.vm.name
}

output "server_ip" {
  value = hcloud_server.vm.ipv4_address
}

output "topic_runtime_env" {
  value = local.topic_runtime_env
}
