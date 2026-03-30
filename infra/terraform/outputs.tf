output "public_api_domain" {
  value = local.public_api_domain
}

output "server_name" {
  value = hcloud_server.vm.name
}

output "server_ip" {
  value = hcloud_server.vm.ipv4_address
}
