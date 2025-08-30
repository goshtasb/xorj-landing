# Compute Module Outputs

# ECS Cluster
output "ecs_cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_arn" {
  description = "ECS Cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_cluster_name" {
  description = "ECS Cluster name"
  value       = aws_ecs_cluster.main.name
}

# ECS Service
output "ecs_service_id" {
  description = "ECS Service ID"
  value       = aws_ecs_service.app.id
}

output "ecs_service_name" {
  description = "ECS Service name"
  value       = aws_ecs_service.app.name
}

output "ecs_service_arn" {
  description = "ECS Service ARN"
  value       = aws_ecs_service.app.id
}

# Task Definition
output "task_definition_arn" {
  description = "ECS Task Definition ARN"
  value       = aws_ecs_task_definition.app.arn
}

output "task_definition_family" {
  description = "ECS Task Definition family"
  value       = aws_ecs_task_definition.app.family
}

output "task_definition_revision" {
  description = "ECS Task Definition revision"
  value       = aws_ecs_task_definition.app.revision
}

# Load Balancer
output "load_balancer_id" {
  description = "Application Load Balancer ID"
  value       = aws_lb.main.id
}

output "load_balancer_arn" {
  description = "Application Load Balancer ARN"
  value       = aws_lb.main.arn
}

output "load_balancer_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = aws_lb.main.dns_name
}

output "load_balancer_zone_id" {
  description = "Application Load Balancer hosted zone ID"
  value       = aws_lb.main.zone_id
}

output "load_balancer_url" {
  description = "Application Load Balancer URL"
  value       = var.certificate_arn != "" ? "https://${aws_lb.main.dns_name}" : "http://${aws_lb.main.dns_name}"
}

# Target Group
output "target_group_arn" {
  description = "Target Group ARN"
  value       = aws_lb_target_group.app.arn
}

output "target_group_name" {
  description = "Target Group name"
  value       = aws_lb_target_group.app.name
}

# Listeners
output "http_listener_arn" {
  description = "HTTP Listener ARN"
  value       = aws_lb_listener.http.arn
}

output "https_listener_arn" {
  description = "HTTPS Listener ARN (if certificate provided)"
  value       = var.certificate_arn != "" ? aws_lb_listener.https[0].arn : null
}

# Auto Scaling
output "autoscaling_target_resource_id" {
  description = "Auto Scaling Target resource ID"
  value       = aws_appautoscaling_target.ecs_target.resource_id
}

output "autoscaling_policy_arn" {
  description = "Auto Scaling Policy ARN"
  value       = aws_appautoscaling_policy.scale_up.arn
}

# Monitoring
output "ecs_exec_log_group_name" {
  description = "CloudWatch log group name for ECS Exec"
  value       = aws_cloudwatch_log_group.ecs_exec.name
}

# Container Information
output "container_name" {
  description = "Container name used in the task definition"
  value       = "${var.project_name}-app"
}

output "container_port" {
  description = "Container port"
  value       = var.container_port
}

# ECR Repository URL (for reference)
output "ecr_repository_url" {
  description = "ECR Repository URL for container images"
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/${var.project_name}"
}