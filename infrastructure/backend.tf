# Terraform Backend Configuration
# Stores state file securely in AWS S3 with DynamoDB locking

terraform {
  required_version = ">= 1.5"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote backend configuration for secure state management
  backend "s3" {
    bucket         = "xorj-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "xorj-terraform-locks"
    
    # Additional security configurations
    versioning             = true
    server_side_encryption = "AES256"
    
    # Prevent accidental state file deletion
    lifecycle {
      prevent_destroy = true
    }
  }
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region
  
  # Default tags applied to all resources
  default_tags {
    tags = {
      Project     = "XORJ"
      Environment = var.environment
      ManagedBy   = "Terraform"
      CreatedBy   = "Infrastructure-Team"
      Owner       = var.project_owner
      CostCenter  = var.cost_center
    }
  }
}

# Data source for current AWS caller identity
data "aws_caller_identity" "current" {}

# Data source for available AWS availability zones
data "aws_availability_zones" "available" {
  state = "available"
  
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}