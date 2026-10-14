terraform {
  required_version = ">= 1.5"
  required_providers {
    huaweicloud = {
      source  = "huaweicloud/huaweicloud"
      version = ">= 1.60.0, < 2.0.0"
    }
  }
}

# Credentials come from the environment, never from files in the repo:
#   export HW_ACCESS_KEY=...  HW_SECRET_KEY=...
provider "huaweicloud" {
  region = var.region
}
