# Cache Module - Managed Redis with ElastiCache
# Provides high-performance, secure caching for XORJ platform

# Generate random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false
}

# Store Redis auth token in Secrets Manager
resource "aws_secretsmanager_secret" "redis_auth_token" {
  name        = "${var.project_name}-${var.environment}-redis-auth-token"
  description = "Redis authentication token for ${var.project_name} ${var.environment}"
  kms_key_id  = var.kms_key_id
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-auth-token"
    Type = "Cache Credentials"
  })
}

resource "aws_secretsmanager_secret_version" "redis_auth_token" {
  secret_id     = aws_secretsmanager_secret.redis_auth_token.id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth_token.result
  })
}

# ElastiCache Parameter Group for Redis optimization
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7.x"
  name   = "${var.project_name}-${var.environment}-redis-params"
  
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  parameter {
    name  = "timeout"
    value = "300"
  }
  
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-params"
  })
}

# ElastiCache Replication Group (for production) or Single Node (for development)
resource "aws_elasticache_replication_group" "redis" {
  count = var.environment == "production" ? 1 : 0
  
  replication_group_id         = "${var.project_name}-${var.environment}-redis"
  description                  = "Redis replication group for ${var.project_name} ${var.environment}"
  
  # Node configuration
  node_type            = var.node_type
  port                 = var.port
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  
  # Replication configuration
  num_cache_clusters         = 2
  automatic_failover_enabled = var.automatic_failover_enabled
  multi_az_enabled          = var.multi_az_enabled
  
  # Network configuration
  subnet_group_name  = var.cache_subnet_group_name
  security_group_ids = [var.cache_security_group_id]
  
  # Security configuration
  auth_token                 = var.auth_token_enabled ? random_password.redis_auth_token.result : null
  transit_encryption_enabled = var.transit_encryption_enabled
  at_rest_encryption_enabled = var.at_rest_encryption_enabled
  kms_key_id                = var.at_rest_encryption_enabled ? var.kms_key_id : null
  
  # Engine configuration
  engine               = "redis"
  engine_version       = var.engine_version
  
  # Backup configuration
  snapshot_retention_limit = var.snapshot_retention_limit
  snapshot_window         = var.snapshot_window
  
  # Maintenance
  maintenance_window = var.maintenance_window
  
  # Logging
  log_delivery_configuration {
    destination      = aws_cloudwatch_log_group.redis_slow_log.name
    destination_type = "cloudwatch-logs"
    log_format       = "text"
    log_type         = "slow-log"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-replication-group"
    Type = "Cache Replication Group"
    Engine = "Redis"
  })
}

# ElastiCache Single Node (for development)
resource "aws_elasticache_cluster" "redis" {
  count = var.environment != "production" ? 1 : 0
  
  cluster_id           = "${var.project_name}-${var.environment}-redis"
  engine               = "redis"
  node_type           = var.node_type
  num_cache_nodes     = 1
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  port                = var.port
  subnet_group_name   = var.cache_subnet_group_name
  security_group_ids  = [var.cache_security_group_id]
  
  # Security configuration (limited for single node)
  engine_version = var.engine_version
  
  # Maintenance
  maintenance_window = var.maintenance_window
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-cluster"
    Type = "Cache Cluster"
    Engine = "Redis"
  })
}

# CloudWatch Log Groups for Redis logs
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}-${var.environment}/redis-slow-log"
  retention_in_days = 7
  kms_key_id        = var.kms_key_id
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-redis-slow-log"
  })
}

# CloudWatch Alarms for Cache Monitoring
resource "aws_cloudwatch_metric_alarm" "cache_cpu" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors Redis CPU utilization"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    CacheClusterId = var.environment == "production" ? 
      "${aws_elasticache_replication_group.redis[0].replication_group_id}-001" : 
      aws_elasticache_cluster.redis[0].cluster_id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cache_memory" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-high-memory"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors Redis memory usage"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    CacheClusterId = var.environment == "production" ? 
      "${aws_elasticache_replication_group.redis[0].replication_group_id}-001" : 
      aws_elasticache_cluster.redis[0].cluster_id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cache_connections" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-high-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CurrConnections"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = "50"
  alarm_description   = "This metric monitors Redis connection count"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    CacheClusterId = var.environment == "production" ? 
      "${aws_elasticache_replication_group.redis[0].replication_group_id}-001" : 
      aws_elasticache_cluster.redis[0].cluster_id
  }
  
  tags = var.tags
}

# Cache evictions alarm
resource "aws_cloudwatch_metric_alarm" "cache_evictions" {
  alarm_name          = "${var.project_name}-${var.environment}-redis-evictions"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "This metric monitors Redis cache evictions"
  alarm_actions       = []  # Add SNS topic ARN for notifications
  
  dimensions = {
    CacheClusterId = var.environment == "production" ? 
      "${aws_elasticache_replication_group.redis[0].replication_group_id}-001" : 
      aws_elasticache_cluster.redis[0].cluster_id
  }
  
  tags = var.tags
}