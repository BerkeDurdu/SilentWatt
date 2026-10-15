# One VM running deploy/compose.cloud.yml (PRD §6.1), with OBS for evidence and backups and SWR for the
# image. Optional managed PostgreSQL. Apply:  terraform init && terraform apply -var-file=silentwatt.tfvars

data "huaweicloud_availability_zones" "zones" {}

data "huaweicloud_images_image" "ubuntu" {
  name        = "Ubuntu 22.04 server 64bit"
  visibility  = "public"
  most_recent = true
}

resource "huaweicloud_vpc" "main" {
  name = "${var.name}-vpc"
  cidr = "10.20.0.0/16"
}

resource "huaweicloud_vpc_subnet" "main" {
  name       = "${var.name}-subnet"
  vpc_id     = huaweicloud_vpc.main.id
  cidr       = "10.20.1.0/24"
  gateway_ip = "10.20.1.1"
}

# Web traffic from anywhere, SSH only from the admin range. Outbound stays open (image pulls, OBS, certificates).
resource "huaweicloud_networking_secgroup" "console" {
  name        = "${var.name}-console"
  description = "SilentWatt console: HTTP/HTTPS public, SSH from admin_cidr"
}

resource "huaweicloud_networking_secgroup_rule" "web" {
  for_each          = toset(["80", "443"])
  security_group_id = huaweicloud_networking_secgroup.console.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = tonumber(each.value)
  port_range_max    = tonumber(each.value)
  remote_ip_prefix  = "0.0.0.0/0"
}

resource "huaweicloud_networking_secgroup_rule" "ssh" {
  security_group_id = huaweicloud_networking_secgroup.console.id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = var.admin_cidr
}

resource "huaweicloud_kps_keypair" "admin" {
  name       = "${var.name}-admin"
  public_key = file(pathexpand(var.ssh_public_key))
}

resource "huaweicloud_compute_instance" "console" {
  name               = "${var.name}-console"
  image_id           = data.huaweicloud_images_image.ubuntu.id
  flavor_id          = var.flavor
  key_pair           = huaweicloud_kps_keypair.admin.name
  security_group_ids = [huaweicloud_networking_secgroup.console.id]
  availability_zone  = data.huaweicloud_availability_zones.zones.names[0]
  system_disk_type   = "SSD"
  system_disk_size   = var.system_disk_gb
  user_data          = file("${path.module}/cloud-init.yaml")

  network {
    uuid = huaweicloud_vpc_subnet.main.id
  }
}

resource "huaweicloud_vpc_eip" "console" {
  publicip {
    type = var.eip_type
  }
  bandwidth {
    name        = "${var.name}-bandwidth"
    size        = var.bandwidth_mbit
    share_type  = "PER"
    charge_mode = "traffic"
  }
}

resource "huaweicloud_compute_eip_associate" "console" {
  public_ip   = huaweicloud_vpc_eip.console.address
  instance_id = huaweicloud_compute_instance.console.id
}

# One KMS key encrypts what holds residents' data at rest: the OBS bucket and the RDS disk.
resource "huaweicloud_kms_key" "data" {
  key_alias    = "${var.name}-data"
  key_usage    = "ENCRYPT_DECRYPT"
  pending_days = "7"
}

# Evidence (obs://<bucket>/evidence/<run-id>/) and database backups (obs://<bucket>/backups/).
# Private, versioned and encrypted on the server side with the KMS key.
resource "huaweicloud_obs_bucket" "data" {
  bucket        = var.bucket_name
  acl           = "private"
  storage_class = "STANDARD"
  versioning    = true
  encryption    = true
  sse_algorithm = "kms"
  kms_key_id    = huaweicloud_kms_key.data.id

  lifecycle_rule {
    name    = "expire-old-backups"
    prefix  = "backups/"
    enabled = true
    expiration {
      days = 30
    }
  }
}

resource "huaweicloud_swr_organization" "console" {
  name = var.swr_organization
}

# Optional managed PostgreSQL in the same subnet; the console then connects with SILENTWATT_DATABASE_URL.
resource "huaweicloud_networking_secgroup" "db" {
  count       = var.managed_database ? 1 : 0
  name        = "${var.name}-db"
  description = "PostgreSQL reachable only from the console security group"
}

resource "huaweicloud_networking_secgroup_rule" "db_from_console" {
  count             = var.managed_database ? 1 : 0
  security_group_id = huaweicloud_networking_secgroup.db[0].id
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 5432
  port_range_max    = 5432
  remote_group_id   = huaweicloud_networking_secgroup.console.id
}

resource "huaweicloud_rds_instance" "db" {
  count             = var.managed_database ? 1 : 0
  name              = "${var.name}-db"
  flavor            = var.db_flavor
  vpc_id            = huaweicloud_vpc.main.id
  subnet_id         = huaweicloud_vpc_subnet.main.id
  security_group_id = huaweicloud_networking_secgroup.db[0].id
  availability_zone = [data.huaweicloud_availability_zones.zones.names[0]]

  db {
    type     = "PostgreSQL"
    version  = "16"
    password = var.db_password
  }

  volume {
    type               = "CLOUDSSD"
    size               = 40
    disk_encryption_id = huaweicloud_kms_key.data.id
  }

  backup_strategy {
    start_time = "03:00-04:00"
    keep_days  = 7
  }
}
