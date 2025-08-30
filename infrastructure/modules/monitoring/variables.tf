# Monitoring Module Variables

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

# SNS Configuration
variable "notification_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = ""
}

variable "notification_phone" {
  description = "Phone number for critical alert notifications (SMS)"
  type        = string
  default     = ""
}

# Dashboard Configuration
variable "dashboard_period" {
  description = "Default period for dashboard metrics in seconds"
  type        = number
  default     = 300
}

# Resource Identifiers for Monitoring
variable "load_balancer_arn_suffix" {
  description = "ALB ARN suffix for monitoring"
  type        = string
}

variable "target_group_arn_suffix" {
  description = "Target Group ARN suffix for monitoring"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS Cluster name for monitoring"
  type        = string
}

variable "ecs_service_name" {
  description = "ECS Service name for monitoring"
  type        = string
}

variable "database_instance_id" {
  description = "RDS instance ID for monitoring"
  type        = string
}

variable "cache_cluster_id" {
  description = "ElastiCache cluster ID for monitoring"
  type        = string
}

variable "waf_web_acl_name" {
  description = "WAF Web ACL name for monitoring"
  type        = string
}

# Log Groups
variable "application_log_group_name" {
  description = "Application CloudWatch log group name"
  type        = string
}

variable "vpc_flow_log_group_name" {
  description = "VPC Flow Logs CloudWatch log group name"
  type        = string
}

# Alert Thresholds
variable "cpu_threshold_warning" {
  description = "CPU utilization threshold for warning alerts"
  type        = number
  default     = 70
}

variable "cpu_threshold_critical" {
  description = "CPU utilization threshold for critical alerts"
  type        = number
  default     = 85
}

variable "memory_threshold_warning" {
  description = "Memory utilization threshold for warning alerts"
  type        = number
  default     = 75
}

variable "memory_threshold_critical" {
  description = "Memory utilization threshold for critical alerts"
  type        = number
  default     = 90
}

variable "response_time_threshold" {
  description = "Response time threshold in milliseconds"
  type        = number
  default     = 2000
}

variable "error_rate_threshold" {
  description = "Error rate threshold percentage"
  type        = number
  default     = 5
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}