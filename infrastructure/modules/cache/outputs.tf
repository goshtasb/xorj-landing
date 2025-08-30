# Cache Module Outputs

# Primary cache endpoint (different for single node vs replication group)
output "cache_endpoint" {
  description = "Primary cache endpoint"
  value = var.environment == "production" ? 
    aws_elasticache_replication_group.redis[0].configuration_endpoint_address : 
    aws_elasticache_cluster.redis[0].cache_nodes[0].address
  sensitive = true
}

# Cache port
output "cache_port" {
  description = "Cache port"
  value = var.environment == "production" ? 
    aws_elasticache_replication_group.redis[0].port : 
    aws_elasticache_cluster.redis[0].port
}

# Replication Group outputs (production only)
output "replication_group_id" {
  description = "ElastiCache replication group ID"
  value       = var.environment == "production" ? aws_elasticache_replication_group.redis[0].replication_group_id : null
}

output "replication_group_arn" {
  description = "ElastiCache replication group ARN"
  value       = var.environment == "production" ? aws_elasticache_replication_group.redis[0].arn : null
}

output "primary_endpoint_address" {
  description = "Primary endpoint address (replication group)"
  value       = var.environment == "production" ? aws_elasticache_replication_group.redis[0].primary_endpoint_address : null
  sensitive   = true
}

output "reader_endpoint_address" {
  description = "Reader endpoint address (replication group)"
  value       = var.environment == "production" ? aws_elasticache_replication_group.redis[0].reader_endpoint_address : null
  sensitive   = true
}

# Single cluster outputs (development)
output "cluster_id" {
  description = "ElastiCache cluster ID"
  value       = var.environment != "production" ? aws_elasticache_cluster.redis[0].cluster_id : null
}

output "cluster_arn" {
  description = "ElastiCache cluster ARN"
  value       = var.environment != "production" ? aws_elasticache_cluster.redis[0].arn : null
}

# Auth token secret
output "auth_token_secret_arn" {
  description = "ARN of the Redis auth token secret"
  value       = aws_secretsmanager_secret.redis_auth_token.arn
}

output "auth_token_secret_name" {
  description = "Name of the Redis auth token secret"
  value       = aws_secretsmanager_secret.redis_auth_token.name
}

# Parameter group
output "parameter_group_name" {
  description = "Parameter group name"
  value       = aws_elasticache_parameter_group.redis.name
}

# Engine information
output "engine_version" {
  description = "Redis engine version"
  value       = var.engine_version
}

# Log group
output "slow_log_group_name" {
  description = "CloudWatch log group name for Redis slow logs"
  value       = aws_cloudwatch_log_group.redis_slow_log.name
}

# Connection information for application configuration
output "cache_connection_string" {
  description = "Redis connection string format"
  value = var.environment == "production" ? 
    "redis://${aws_elasticache_replication_group.redis[0].primary_endpoint_address}:${aws_elasticache_replication_group.redis[0].port}" :
    "redis://${aws_elasticache_cluster.redis[0].cache_nodes[0].address}:${aws_elasticache_cluster.redis[0].port}"
  sensitive = true
}