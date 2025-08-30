# XORJ Trading Platform - Main Infrastructure Configuration
# Root Terraform configuration orchestrating all infrastructure modules

locals {
  # Common tags for all resources
  common_tags = {
    Project         = var.project_name
    Environment     = var.environment
    ManagedBy      = "Terraform"
    DeploymentDate = timestamp()
  }
}

# Networking Module
# Creates VPC, subnets, security groups, and network infrastructure
module "networking" {
  source = "./modules/networking"
  
  # Basic configuration
  project_name   = var.project_name
  environment    = var.environment
  aws_region     = var.aws_region
  
  # VPC configuration
  vpc_cidr                 = var.vpc_cidr
  availability_zones_count = var.availability_zones_count
  public_subnet_cidrs     = var.public_subnet_cidrs
  private_subnet_cidrs    = var.private_subnet_cidrs
  database_subnet_cidrs   = var.database_subnet_cidrs
  
  # Security configuration
  allowed_cidr_blocks = var.allowed_cidr_blocks
  
  tags = local.common_tags
}

# Security Module
# Creates IAM roles, policies, security groups, and secrets management
module "security" {
  source = "./modules/security"
  
  # Basic configuration
  project_name = var.project_name
  environment  = var.environment
  
  # Network references
  vpc_id              = module.networking.vpc_id
  private_subnet_ids  = module.networking.private_subnet_ids
  database_subnet_ids = module.networking.database_subnet_ids
  
  # Security configuration
  allowed_cidr_blocks = var.allowed_cidr_blocks
  
  tags = local.common_tags
}

# Database Module
# Creates RDS PostgreSQL instance with backup and monitoring
module "database" {
  source = "./modules/database"
  
  # Basic configuration
  project_name = var.project_name
  environment  = var.environment
  
  # Network configuration
  vpc_id                        = module.networking.vpc_id
  database_subnet_group_name    = module.networking.db_subnet_group_name
  database_security_group_id    = module.security.database_security_group_id
  
  # Database configuration
  db_instance_class       = var.db_instance_class
  db_allocated_storage    = var.db_allocated_storage
  db_max_allocated_storage = var.db_max_allocated_storage
  backup_retention_period = var.db_backup_retention_period
  backup_window          = var.db_backup_window
  maintenance_window     = var.db_maintenance_window
  multi_az               = var.db_multi_az
  deletion_protection    = var.db_deletion_protection
  
  # Security
  kms_key_id                     = module.security.kms_key_id
  database_credentials_secret_arn = module.security.database_credentials_secret_arn
  
  tags = local.common_tags
}

# Cache Module
# Creates ElastiCache Redis cluster for session storage and caching
module "cache" {
  source = "./modules/cache"
  
  # Basic configuration
  project_name = var.project_name
  environment  = var.environment
  
  # Network configuration
  vpc_id                     = module.networking.vpc_id
  cache_subnet_group_name    = module.networking.cache_subnet_group_name
  cache_security_group_id    = module.security.cache_security_group_id
  
  # Cache configuration
  node_type               = var.redis_node_type
  num_cache_nodes         = var.redis_num_cache_nodes
  engine_version          = var.redis_engine_version
  port                    = var.redis_port
  maintenance_window      = var.redis_maintenance_window
  snapshot_retention_limit = var.redis_snapshot_retention_limit
  snapshot_window         = var.redis_snapshot_window
  
  # Security
  kms_key_id = module.security.kms_key_id
  
  tags = local.common_tags
}

# Compute Module
# Creates ECS Fargate cluster with auto-scaling and load balancing
module "compute" {
  source = "./modules/compute"
  
  # Basic configuration
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  
  # Network configuration
  vpc_id                        = module.networking.vpc_id
  public_subnet_ids             = module.networking.public_subnet_ids
  private_subnet_ids            = module.networking.private_subnet_ids
  alb_security_group_id         = module.security.alb_security_group_id
  application_security_group_id = module.security.application_security_group_id
  
  # ECS configuration
  ecs_cpu           = var.ecs_cpu
  ecs_memory        = var.ecs_memory
  ecs_desired_count = var.ecs_desired_count
  ecs_min_capacity  = var.ecs_min_capacity
  ecs_max_capacity  = var.ecs_max_capacity
  
  # Application configuration
  container_port    = var.container_port
  health_check_path = var.health_check_path
  domain_name       = var.domain_name
  certificate_arn   = var.certificate_arn
  
  # Dependencies
  database_endpoint               = module.database.database_endpoint
  database_name                   = module.database.database_name
  database_credentials_secret_arn = module.security.database_credentials_secret_arn
  application_secrets_secret_arn  = module.security.application_secrets_secret_arn
  cache_endpoint                  = module.cache.cache_endpoint
  redis_auth_token_secret_arn     = module.cache.auth_token_secret_arn
  
  # IAM roles
  ecs_task_execution_role_arn = module.security.ecs_task_execution_role_arn
  ecs_task_role_arn           = module.security.ecs_task_role_arn
  
  # Logging and monitoring
  cloudwatch_log_group_name = module.security.cloudwatch_log_group_name
  waf_web_acl_arn          = module.security.waf_web_acl_arn
  
  tags = local.common_tags
}

# Monitoring Module
# Creates CloudWatch dashboards, alarms, and logging infrastructure
module "monitoring" {
  source = "./modules/monitoring"
  
  # Basic configuration
  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  
  # Notification configuration
  notification_email = var.notification_email
  notification_phone = var.notification_phone
  
  # Resource references for monitoring
  load_balancer_arn_suffix = module.compute.load_balancer_arn
  target_group_arn_suffix  = module.compute.target_group_arn
  ecs_cluster_name         = module.compute.ecs_cluster_name
  ecs_service_name         = module.compute.ecs_service_name
  database_instance_id     = module.database.database_instance_id
  cache_cluster_id         = module.cache.cluster_id != null ? module.cache.cluster_id : module.cache.replication_group_id
  waf_web_acl_name         = "${var.project_name}-${var.environment}-web-acl"
  
  # Log groups
  application_log_group_name = module.security.cloudwatch_log_group_name
  vpc_flow_log_group_name    = "/aws/vpc/flowlogs/${var.project_name}-${var.environment}"
  
  # Alert thresholds
  cpu_threshold_warning    = var.cpu_threshold_warning
  cpu_threshold_critical   = var.cpu_threshold_critical
  memory_threshold_warning = var.memory_threshold_warning
  memory_threshold_critical = var.memory_threshold_critical
  response_time_threshold  = var.response_time_threshold
  error_rate_threshold     = var.error_rate_threshold
  
  tags = local.common_tags
}

# ECR Repository for container images
resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "MUTABLE"
  
  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = module.security.kms_key_arn
  }
  
  tags = merge(local.common_tags, {
    Name    = "${var.project_name}-ecr-repository"
    Purpose = "Container image storage"
  })
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["prod"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 5 staging images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["staging"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 3
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# S3 Buckets for static assets and backups
resource "aws_s3_bucket" "static_assets" {
  bucket = "${var.project_name}-${var.environment}-static-assets"
  
  tags = merge(local.common_tags, {
    Name        = "${var.project_name}-${var.environment}-static-assets"
    Purpose     = "Static asset storage"
    DataClass   = "Public"
  })
}

resource "aws_s3_bucket_versioning" "static_assets_versioning" {
  bucket = aws_s3_bucket.static_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "static_assets_encryption" {
  bucket = aws_s3_bucket.static_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "static_assets_pab" {
  bucket = aws_s3_bucket.static_assets.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# S3 Bucket for application backups
resource "aws_s3_bucket" "backups" {
  bucket = "${var.project_name}-${var.environment}-backups"
  
  tags = merge(local.common_tags, {
    Name        = "${var.project_name}-${var.environment}-backups"
    Purpose     = "Database and application backups"
    DataClass   = "Private"
  })
}

resource "aws_s3_bucket_versioning" "backups_versioning" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups_encryption" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = module.security.kms_key_id
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups_lifecycle" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "backup_lifecycle"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CloudFront Distribution for static assets (if enabled)
resource "aws_cloudfront_distribution" "static_assets" {
  count = var.feature_flags.enable_cdn ? 1 : 0

  origin {
    domain_name = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.static_assets.bucket}"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.static_assets[0].cloudfront_access_identity_path
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  default_cache_behavior {
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.static_assets.bucket}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.certificate_arn == "" ? true : false
    acm_certificate_arn           = var.certificate_arn != "" ? var.certificate_arn : null
    ssl_support_method            = var.certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version      = var.certificate_arn != "" ? "TLSv1.2_2021" : null
  }

  tags = merge(local.common_tags, {
    Name    = "${var.project_name}-${var.environment}-cdn"
    Purpose = "Static asset distribution"
  })
}

resource "aws_cloudfront_origin_access_identity" "static_assets" {
  count   = var.feature_flags.enable_cdn ? 1 : 0
  comment = "OAI for ${var.project_name}-${var.environment} static assets"
}

# SNS Topic for alerts
resource "aws_sns_topic" "alerts" {
  name         = "${var.project_name}-${var.environment}-alerts"
  display_name = "XORJ ${title(var.environment)} Alerts"
  
  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "email_alerts" {
  count     = var.alarm_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}