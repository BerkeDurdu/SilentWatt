variable "region" {
  description = "Huawei Cloud region, e.g. tr-west-1 (Istanbul) or ap-southeast-3 (Singapore)."
  type        = string
  default     = "tr-west-1"
}

variable "name" {
  description = "Prefix for every resource."
  type        = string
  default     = "silentwatt"
}

variable "flavor" {
  description = "ECS flavor. 2 vCPU / 4 GB runs the console, PostgreSQL and the proxy; check availability in the region."
  type        = string
  default     = "s6.large.2"
}

variable "system_disk_gb" {
  type    = number
  default = 40
}

variable "ssh_public_key" {
  description = "Path to the SSH public key allowed to log in as root."
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "admin_cidr" {
  description = "Only this address range may reach SSH (port 22), e.g. your office IP with /32."
  type        = string
}

variable "eip_type" {
  description = "EIP line type offered in the region (5_bgp in most regions)."
  type        = string
  default     = "5_bgp"
}

variable "bandwidth_mbit" {
  description = "Public bandwidth, billed by traffic."
  type        = number
  default     = 5
}

variable "bucket_name" {
  description = "OBS bucket for detector evidence and database backups. Bucket names are global; pick a unique one."
  type        = string
}

variable "swr_organization" {
  description = "SWR organization the console image is pushed to."
  type        = string
  default     = "silentwatt"
}

variable "managed_database" {
  description = "Create RDS for PostgreSQL instead of running PostgreSQL on the VM. Costs more; off by default."
  type        = bool
  default     = false
}

variable "db_flavor" {
  type    = string
  default = "rds.pg.n1.large.2"
}

variable "db_password" {
  description = "Password of the RDS root user (only with managed_database). Pass with TF_VAR_db_password."
  type        = string
  default     = null
  sensitive   = true
}
