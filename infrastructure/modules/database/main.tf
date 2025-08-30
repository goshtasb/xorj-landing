# Database Module - Managed PostgreSQL with RDS
# Provides highly available, encrypted database for XORJ platform

# RDS Parameter Group for PostgreSQL optimization
resource "aws_db_parameter_group" "postgresql" {
  family = "postgres15"
  name   = "${var.project_name}-${var.environment}-postgresql-params"
  
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
  
  parameter {
    name  = "log_statement"
    value = "all"
  }
  
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
  
  parameter {
    name  = "max_connections"
    value = "100"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-postgresql-params"
  })
}

# RDS Option Group (PostgreSQL doesn't require options but good practice)
resource "aws_db_option_group" "postgresql" {
  name                 = "${var.project_name}-${var.environment}-postgresql-options"
  option_group_description = "PostgreSQL option group for ${var.project_name} ${var.environment}"
  engine_name          = "postgres"
  major_engine_version = "15"
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-postgresql-options"
  })
}

# Get database credentials from Secrets Manager
data "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = var.database_credentials_secret_arn
}

locals {
  db_credentials = jsondecode(data.aws_secretsmanager_secret_version.database_credentials.secret_string)
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "postgresql" {
  # Basic Configuration
  identifier        = "${var.project_name}-${var.environment}-postgresql"
  engine            = "postgres"
  engine_version    = "15.8"
  instance_class    = var.db_instance_class
  
  # Database Configuration
  db_name  = "xorj_${var.environment}"
  username = local.db_credentials.username
  password = local.db_credentials.password
  port     = 5432
  
  # Storage Configuration
  allocated_storage       = var.db_allocated_storage
  max_allocated_storage   = var.db_max_allocated_storage
  storage_type           = "gp3"
  storage_encrypted      = true
  kms_key_id            = var.kms_key_id
  
  # Network Configuration
  db_subnet_group_name   = var.database_subnet_group_name
  vpc_security_group_ids = [var.database_security_group_id]
  publicly_accessible    = false
  
  # High Availability & Backup
  multi_az               = var.multi_az
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  copy_tags_to_snapshot  = true
  delete_automated_backups = false
  
  # Parameter and Option Groups
  parameter_group_name = aws_db_parameter_group.postgresql.name
  option_group_name    = aws_db_option_group.postgresql.name
  
  # Monitoring and Logging
  monitoring_interval    = 60
  monitoring_role_arn   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports = [
    "postgresql",
    "upgrade"
  ]
  
  performance_insights_enabled = true
  performance_insights_kms_key_id = var.kms_key_id
  performance_insights_retention_period = 7
  
  # Security
  deletion_protection = var.deletion_protection
  
  # Prevent accidental deletion during development
  skip_final_snapshot       = var.environment == "development"
  final_snapshot_identifier = var.environment != "development" ? "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-postgresql"
    Type = "Primary Database"
    Engine = "PostgreSQL"
  })
  
  # Lifecycle management
  lifecycle {
    prevent_destroy = false  # Set to true in production
    ignore_changes = [
      password,  # Password managed by Secrets Manager rotation
    ]
  }
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-${var.environment}-rds-monitoring-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Alarms for Database Monitoring
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-database-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors database CPU utilization"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgresql.id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "database_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-database-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors database connection count"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgresql.id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "database_freeable_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-database-low-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "268435456"  # 256MB in bytes
  alarm_description   = "This metric monitors database available memory"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgresql.id
  }
  
  tags = var.tags
}

# Read Replica for Production (optional)
resource "aws_db_instance" "postgresql_read_replica" {
  count = var.environment == "production" ? 1 : 0
  
  identifier                = "${var.project_name}-${var.environment}-postgresql-replica"
  replicate_source_db       = aws_db_instance.postgresql.identifier
  instance_class           = var.db_instance_class
  publicly_accessible      = false
  auto_minor_version_upgrade = false
  
  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  performance_insights_enabled = true
  performance_insights_kms_key_id = var.kms_key_id
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-postgresql-replica"
    Type = "Read Replica"
    Engine = "PostgreSQL"
  })
}