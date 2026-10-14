output "public_ip" {
  description = "Point the console's DNS name (SILENTWATT_SITE) at this address."
  value       = huaweicloud_vpc_eip.console.address
}

output "ssh" {
  value = "ssh root@${huaweicloud_vpc_eip.console.address}"
}

output "obs_bucket" {
  value = huaweicloud_obs_bucket.data.bucket
}

output "swr_registry" {
  value = "swr.${var.region}.myhuaweicloud.com/${huaweicloud_swr_organization.console.name}"
}

output "database_private_ip" {
  description = "Only with managed_database: use it in SILENTWATT_DATABASE_URL."
  value       = var.managed_database ? huaweicloud_rds_instance.db[0].fixed_ip : null
}
