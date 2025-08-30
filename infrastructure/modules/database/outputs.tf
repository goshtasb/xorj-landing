# Database Module Outputs

output "database_instance_id" {
  description = "RDS instance ID"
  value       = aws_db_instance.postgresql.id
}

output "database_instance_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.postgresql.arn
}

output "database_endpoint" {
  description = "Database connection endpoint"
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "database_port" {
  description = "Database connection port"
  value       = aws_db_instance.postgresql.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.postgresql.db_name
}

output "database_username" {
  description = "Database master username"
  value       = aws_db_instance.postgresql.username
  sensitive   = true
}

output "database_hosted_zone_id" {
  description = "Database hosted zone ID"
  value       = aws_db_instance.postgresql.hosted_zone_id
}

output "database_resource_id" {
  description = "Database resource ID"
  value       = aws_db_instance.postgresql.resource_id
}

output "database_status" {
  description = "Database instance status"
  value       = aws_db_instance.postgresql.status
}

output "database_backup_window" {
  description = "Database backup window"
  value       = aws_db_instance.postgresql.backup_window
}

output "database_maintenance_window" {
  description = "Database maintenance window"
  value       = aws_db_instance.postgresql.maintenance_window
}

output "read_replica_endpoint" {
  description = "Read replica endpoint (if created)"
  value       = var.environment == "production" ? aws_db_instance.postgresql_read_replica[0].endpoint : null
  sensitive   = true
}

output "monitoring_role_arn" {
  description = "RDS monitoring role ARN"
  value       = aws_iam_role.rds_monitoring.arn
}

output "parameter_group_name" {
  description = "Database parameter group name"
  value       = aws_db_parameter_group.postgresql.name
}

output "option_group_name" {
  description = "Database option group name"
  value       = aws_db_option_group.postgresql.name
}