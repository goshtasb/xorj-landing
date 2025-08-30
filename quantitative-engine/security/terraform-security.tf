# XORJ Quantitative Engine - Secure Infrastructure as Code (SR-1, SR-5)
# Terraform configuration implementing Zero Trust and Least Privilege

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Variables for environment configuration
variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging", "development"], var.environment)
    error_message = "Environment must be production, staging, or development."
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "Availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# SR-1: Zero Trust Network - Private VPC with no internet access
resource "aws_vpc" "xorj_vpc" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "xorj-quantitative-engine-${var.environment}"
    Environment = var.environment
    Purpose     = "Zero Trust Network"
    Requirement = "SR-1"
  }
}

# Private subnets for application (no internet access)
resource "aws_subnet" "private_app_subnets" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.xorj_vpc.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index + 1)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name        = "xorj-private-app-${var.availability_zones[count.index]}"
    Type        = "Private-App"
    Environment = var.environment
    Requirement = "SR-1"
  }
}

# Private subnets for database
resource "aws_subnet" "private_db_subnets" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.xorj_vpc.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 10)
  availability_zone = var.availability_zones[count.index]

  tags = {
    Name        = "xorj-private-db-${var.availability_zones[count.index]}"
    Type        = "Private-DB"
    Environment = var.environment
    Requirement = "SR-1"
  }
}

# VPC Endpoints for AWS services (no internet required)
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.xorj_vpc.id
  service_name        = "com.amazonaws.us-east-1.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private_app_subnets[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = {
    Name        = "xorj-secretsmanager-endpoint"
    Requirement = "SR-2"
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.xorj_vpc.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private_app.id]

  tags = {
    Name        = "xorj-s3-endpoint"
    Requirement = "SR-3"
  }
}

# Route table for private app subnets (no internet gateway)
resource "aws_route_table" "private_app" {
  vpc_id = aws_vpc.xorj_vpc.id

  tags = {
    Name        = "xorj-private-app-routes"
    Environment = var.environment
    Requirement = "SR-1"
  }
}

resource "aws_route_table_association" "private_app" {
  count = length(aws_subnet.private_app_subnets)

  subnet_id      = aws_subnet.private_app_subnets[count.index].id
  route_table_id = aws_route_table.private_app.id
}

# SR-1: Security Groups with minimal access
resource "aws_security_group" "quantitative_engine" {
  name_prefix = "xorj-quant-engine-"
  vpc_id      = aws_vpc.xorj_vpc.id
  description = "Security group for XORJ Quantitative Engine - Zero Trust"

  # SR-1: No inbound public access - only from load balancer
  ingress {
    description     = "HTTPS from internal load balancer only"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.internal_load_balancer.id]
  }

  # Minimal outbound access
  egress {
    description = "HTTPS for API calls"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "PostgreSQL to database"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.database.id]
  }

  egress {
    description     = "Redis to cache"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.redis.id]
  }

  tags = {
    Name        = "xorj-quantitative-engine-sg"
    Environment = var.environment
    Requirement = "SR-1"
  }
}

# Internal load balancer security group
resource "aws_security_group" "internal_load_balancer" {
  name_prefix = "xorj-internal-alb-"
  vpc_id      = aws_vpc.xorj_vpc.id
  description = "Internal load balancer - VPC access only"

  ingress {
    description = "HTTPS from VPC only"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    description     = "To quantitative engine"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.quantitative_engine.id]
  }

  tags = {
    Name        = "xorj-internal-alb-sg"
    Requirement = "SR-1"
  }
}

# Database security group
resource "aws_security_group" "database" {
  name_prefix = "xorj-database-"
  vpc_id      = aws_vpc.xorj_vpc.id
  description = "Database access from application only"

  ingress {
    description     = "PostgreSQL from app"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.quantitative_engine.id]
  }

  tags = {
    Name        = "xorj-database-sg"
    Requirement = "SR-1"
  }
}

# Redis security group
resource "aws_security_group" "redis" {
  name_prefix = "xorj-redis-"
  vpc_id      = aws_vpc.xorj_vpc.id
  description = "Redis access from application only"

  ingress {
    description     = "Redis from app"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.quantitative_engine.id]
  }

  tags = {
    Name        = "xorj-redis-sg"
    Requirement = "SR-1"
  }
}

# VPC Endpoints security group
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "xorj-vpc-endpoints-"
  vpc_id      = aws_vpc.xorj_vpc.id
  description = "VPC Endpoints access"

  ingress {
    description     = "HTTPS from app"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.quantitative_engine.id]
  }

  tags = {
    Name        = "xorj-vpc-endpoints-sg"
    Requirement = "SR-1"
  }
}

# SR-5: IAM Role with minimal permissions
resource "aws_iam_role" "quantitative_engine_execution" {
  name = "XORJQuantEngineExecutionRole-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = ["us-east-1", "us-west-2"]
          }
        }
      }
    ]
  })

  tags = {
    Name        = "XORJQuantEngineExecutionRole"
    Environment = var.environment
    Requirement = "SR-5"
  }
}

# SR-5: Minimal permissions policy
resource "aws_iam_policy" "quantitative_engine_minimal" {
  name        = "XORJQuantEngineMinimalPolicy-${var.environment}"
  description = "Minimal permissions for XORJ Quantitative Engine"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SecretsManagerReadOnly"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          "arn:aws:secretsmanager:*:*:secret:xorj/database-*",
          "arn:aws:secretsmanager:*:*:secret:xorj/redis-*",
          "arn:aws:secretsmanager:*:*:secret:xorj/api-keys-*",
          "arn:aws:secretsmanager:*:*:secret:xorj/internal-*"
        ]
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = ["us-east-1", "us-west-2"]
          }
        }
      },
      {
        Sid    = "AuditLogsWriteOnly"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = [
          "arn:aws:s3:::xorj-audit-logs-${var.environment}/audit/*"
        ]
        Condition = {
          StringEquals = {
            "s3:x-amz-server-side-encryption" = "AES256"
          }
        }
      },
      {
        Sid    = "CloudWatchLogsWrite"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          "arn:aws:logs:*:*:log-group:/xorj/quantitative-engine/${var.environment}/*"
        ]
      }
    ]
  })

  tags = {
    Name        = "XORJQuantEngineMinimalPolicy"
    Environment = var.environment
    Requirement = "SR-5"
  }
}

resource "aws_iam_role_policy_attachment" "quantitative_engine_minimal" {
  role       = aws_iam_role.quantitative_engine_execution.name
  policy_arn = aws_iam_policy.quantitative_engine_minimal.arn
}

# SR-3: S3 bucket for immutable audit logs
resource "aws_s3_bucket" "audit_logs" {
  bucket = "xorj-audit-logs-${var.environment}"

  tags = {
    Name        = "XORJ Audit Logs"
    Environment = var.environment
    Requirement = "SR-3"
    Purpose     = "Immutable Logging"
  }
}

# Bucket versioning for audit trail
resource "aws_s3_bucket_versioning" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy for immutable logs
resource "aws_s3_bucket_policy" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureConnections"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.audit_logs.arn,
          "${aws_s3_bucket.audit_logs.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid    = "AllowQuantEngineWrite"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.quantitative_engine_execution.arn
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.audit_logs.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-server-side-encryption" = "AES256"
          }
        }
      },
      {
        Sid       = "DenyObjectDeletion"
        Effect    = "Deny"
        Principal = "*"
        Action = [
          "s3:DeleteObject",
          "s3:DeleteObjectVersion"
        ]
        Resource = "${aws_s3_bucket.audit_logs.arn}/*"
      }
    ]
  })
}

# CloudWatch Log Group for application logs
resource "aws_cloudwatch_log_group" "quantitative_engine" {
  name              = "/xorj/quantitative-engine/${var.environment}/application"
  retention_in_days = 30

  tags = {
    Environment = var.environment
    Application = "XORJ Quantitative Engine"
  }
}

# Outputs for other modules
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.xorj_vpc.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private_app_subnets[*].id
}

output "security_group_id" {
  description = "Application security group ID"
  value       = aws_security_group.quantitative_engine.id
}

output "execution_role_arn" {
  description = "ECS execution role ARN"
  value       = aws_iam_role.quantitative_engine_execution.arn
  sensitive   = true
}

output "audit_logs_bucket" {
  description = "Audit logs S3 bucket name"
  value       = aws_s3_bucket.audit_logs.bucket
}