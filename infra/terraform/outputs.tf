output "service_name" {
  value = module.topic_backend_instance.service_name
}

output "server_name" {
  value = hcloud_server.vm.name
}

output "frontend_path" {
  value = module.topic_backend_instance.frontend_path
}

output "backend_api_prefix" {
  value = module.topic_backend_instance.backend_api_prefix
}

output "api_domain" {
  value = local.api_domain
}

output "server_ip" {
  value = hcloud_server.vm.ipv4_address
}
