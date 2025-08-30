# Monitoring Module Outputs

# SNS Topics
output "alerts_topic_arn" {
  description = "ARN of the alerts SNS topic"
  value       = aws_sns_topic.alerts.arn
}

output "critical_alerts_topic_arn" {
  description = "ARN of the critical alerts SNS topic"
  value       = aws_sns_topic.critical_alerts.arn
}

output "alerts_topic_name" {
  description = "Name of the alerts SNS topic"
  value       = aws_sns_topic.alerts.name
}

output "critical_alerts_topic_name" {
  description = "Name of the critical alerts SNS topic"
  value       = aws_sns_topic.critical_alerts.name
}

# Dashboard
output "dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

# Alarms
output "alb_response_time_alarm_arn" {
  description = "ARN of the ALB response time alarm"
  value       = aws_cloudwatch_metric_alarm.alb_response_time.arn
}

output "alb_error_rate_alarm_arn" {
  description = "ARN of the ALB error rate alarm"
  value       = aws_cloudwatch_metric_alarm.alb_error_rate.arn
}

output "ecs_cpu_high_alarm_arn" {
  description = "ARN of the ECS CPU high alarm"
  value       = aws_cloudwatch_metric_alarm.ecs_cpu_high.arn
}

output "ecs_cpu_critical_alarm_arn" {
  description = "ARN of the ECS CPU critical alarm"
  value       = aws_cloudwatch_metric_alarm.ecs_cpu_critical.arn
}

output "ecs_memory_high_alarm_arn" {
  description = "ARN of the ECS memory high alarm"
  value       = aws_cloudwatch_metric_alarm.ecs_memory_high.arn
}

output "rds_cpu_high_alarm_arn" {
  description = "ARN of the RDS CPU high alarm"
  value       = aws_cloudwatch_metric_alarm.rds_cpu_high.arn
}

output "rds_connections_high_alarm_arn" {
  description = "ARN of the RDS connections high alarm"
  value       = aws_cloudwatch_metric_alarm.rds_connections_high.arn
}

output "cache_cpu_high_alarm_arn" {
  description = "ARN of the cache CPU high alarm"
  value       = aws_cloudwatch_metric_alarm.cache_cpu_high.arn
}

output "cache_memory_high_alarm_arn" {
  description = "ARN of the cache memory high alarm"
  value       = aws_cloudwatch_metric_alarm.cache_memory_high.arn
}

output "application_errors_alarm_arn" {
  description = "ARN of the application errors alarm"
  value       = aws_cloudwatch_metric_alarm.application_errors.arn
}

output "system_health_alarm_arn" {
  description = "ARN of the composite system health alarm"
  value       = aws_cloudwatch_composite_alarm.system_health.arn
}

# Log Metric Filter
output "application_errors_metric_filter_name" {
  description = "Name of the application errors log metric filter"
  value       = aws_cloudwatch_log_metric_filter.application_errors.name
}

# Monitoring Summary
output "monitoring_summary" {
  description = "Summary of monitoring configuration"
  value = {
    dashboard_url        = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
    alerts_configured    = length([
      aws_cloudwatch_metric_alarm.alb_response_time,
      aws_cloudwatch_metric_alarm.alb_error_rate,
      aws_cloudwatch_metric_alarm.ecs_cpu_high,
      aws_cloudwatch_metric_alarm.ecs_cpu_critical,
      aws_cloudwatch_metric_alarm.ecs_memory_high,
      aws_cloudwatch_metric_alarm.rds_cpu_high,
      aws_cloudwatch_metric_alarm.rds_connections_high,
      aws_cloudwatch_metric_alarm.cache_cpu_high,
      aws_cloudwatch_metric_alarm.cache_memory_high,
      aws_cloudwatch_metric_alarm.application_errors
    ])
    notification_email   = var.notification_email != "" ? "configured" : "not_configured"
    notification_sms     = var.notification_phone != "" ? "configured" : "not_configured"
    composite_alarm      = "enabled"
  }
}