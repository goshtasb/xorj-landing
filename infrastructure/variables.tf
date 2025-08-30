# XORJ Infrastructure Variables
# Central configuration for all Terraform modules

# General Configuration
variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "xorj"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be either 'staging' or 'production'."
  }
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "project_owner" {
  description = "Owner of the project resources"
  type        = string
  default     = "XORJ-Infrastructure-Team"
}

variable "cost_center" {
  description = "Cost center for resource billing"
  type        = string
  default     = "XORJ-Engineering"
}

# Networking Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones_count" {
  description = "Number of availability zones to use"
  type        = number
  default     = 2
  validation {
    condition     = var.availability_zones_count >= 2 && var.availability_zones_count <= 6
    error_message = "Availability zones count must be between 2 and 6."
  }
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.50.0/24", "10.0.60.0/24"]
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS instance (GB)"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum allocated storage for RDS instance (GB)"
  type        = number
  default     = 100
}

variable "db_backup_retention_period" {
  description = "Backup retention period (days)"
  type        = number
  default     = 7
}

variable "db_backup_window" {
  description = "Backup window"
  type        = string
  default     = "03:00-04:00"
}

variable "db_maintenance_window" {
  description = "Maintenance window"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "db_deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

# Cache Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 1
}

variable "redis_port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

variable "redis_parameter_group_name" {
  description = "Redis parameter group name"
  type        = string
  default     = "default.redis7"
}

# Compute Configuration
variable "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
  default     = "xorj-cluster"
}

variable "ecs_task_cpu" {
  description = "CPU units for ECS tasks"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Memory (MB) for ECS tasks"
  type        = number
  default     = 1024
}

variable "ecs_min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 1
}

variable "ecs_max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 3
}

variable "ecs_target_cpu" {
  description = "Target CPU utilization for auto-scaling"
  type        = number
  default     = 70
}

variable "ecs_target_memory" {
  description = "Target memory utilization for auto-scaling"
  type        = number
  default     = 80
}

# Application Configuration
variable "app_name" {
  description = "Application name"
  type        = string
  default     = "xorj-trading-platform"
}

variable "app_port" {
  description = "Application port"
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "Health check endpoint path"
  type        = string
  default     = "/api/health"
}

# Domain and SSL Configuration
variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "API subdomain"
  type        = string
  default     = "api"
}

variable "certificate_arn" {
  description = "ARN of SSL certificate"
  type        = string
  default     = ""
}

# Security Configuration
variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to access resources"
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Restrict this in production
}

variable "enable_waf" {
  description = "Enable AWS WAF"
  type        = bool
  default     = true
}

variable "enable_shield" {
  description = "Enable AWS Shield Advanced"
  type        = bool
  default     = false  # Enable for production
}

# Monitoring Configuration
variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention period (days)"
  type        = number
  default     = 30
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
  default     = ""
}

# Backup Configuration
variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for RDS"
  type        = bool
  default     = true
}

variable "snapshot_retention_limit" {
  description = "Number of snapshots to retain"
  type        = number
  default     = 30
}

# Cost Optimization
variable "enable_spot_instances" {
  description = "Use spot instances for cost optimization"
  type        = bool
  default     = false
}

variable "scheduled_scaling" {
  description = "Enable scheduled auto-scaling"
  type        = bool
  default     = false
}

# Environment-Specific Overrides
variable "environment_config" {
  description = "Environment-specific configuration overrides"
  type = object({
    staging = optional(object({
      db_instance_class     = optional(string)
      redis_node_type      = optional(string)
      ecs_min_capacity     = optional(number)
      ecs_max_capacity     = optional(number)
      db_multi_az          = optional(bool)
      enable_spot_instances = optional(bool)
    }))
    production = optional(object({
      db_instance_class     = optional(string)
      redis_node_type      = optional(string)
      ecs_min_capacity     = optional(number)
      ecs_max_capacity     = optional(number)
      db_multi_az          = optional(bool)
      enable_spot_instances = optional(bool)
    }))
  })
  default = {
    staging = {
      db_instance_class     = "db.t3.micro"
      redis_node_type      = "cache.t3.micro"
      ecs_min_capacity     = 1
      ecs_max_capacity     = 3
      db_multi_az          = false
      enable_spot_instances = true
    }
    production = {
      db_instance_class     = "db.r5.large"
      redis_node_type      = "cache.r5.large"
      ecs_min_capacity     = 2
      ecs_max_capacity     = 10
      db_multi_az          = true
      enable_spot_instances = false
    }
  }
}

# Feature Flags
variable "feature_flags" {
  description = "Feature flags for enabling/disabling components"
  type = object({
    enable_database    = optional(bool, true)
    enable_cache       = optional(bool, true)
    enable_monitoring  = optional(bool, true)
    enable_cdn         = optional(bool, true)
    enable_waf         = optional(bool, true)
  })
  default = {}
}