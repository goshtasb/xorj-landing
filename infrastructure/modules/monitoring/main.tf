# Monitoring Module - CloudWatch Dashboard and Comprehensive Alerting
# Provides complete observability for XORJ platform

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${var.project_name}-${var.environment}-alerts"
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-alerts"
  })
}

# SNS Topic for Critical Alerts
resource "aws_sns_topic" "critical_alerts" {
  name = "${var.project_name}-${var.environment}-critical-alerts"
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-critical-alerts"
  })
}

# SNS Topic Subscription for Email
resource "aws_sns_topic_subscription" "email_alerts" {
  count = var.notification_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# SNS Topic Subscription for Critical Email
resource "aws_sns_topic_subscription" "critical_email_alerts" {
  count = var.notification_email != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# SNS Topic Subscription for SMS (Critical Only)
resource "aws_sns_topic_subscription" "sms_critical_alerts" {
  count = var.notification_phone != "" ? 1 : 0
  
  topic_arn = aws_sns_topic.critical_alerts.arn
  protocol  = "sms"
  endpoint  = var.notification_phone
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}-dashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      # Application Load Balancer Metrics
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.load_balancer_arn_suffix],
            [".", "TargetResponseTime", ".", "."],
            [".", "HTTPCode_Target_2XX_Count", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", "."],
            [".", "HTTPCode_Target_5XX_Count", ".", "."]
          ]
          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Application Load Balancer Metrics"
          period  = var.dashboard_period
        }
      },
      # ECS Service Metrics
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ServiceName", var.ecs_service_name, "ClusterName", var.ecs_cluster_name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
            [".", "RunningTaskCount", ".", ".", ".", "."]
          ]
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          title  = "ECS Service Metrics"
          period = var.dashboard_period
        }
      },
      # Database Metrics
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.database_instance_id],
            [".", "DatabaseConnections", ".", "."],
            [".", "FreeableMemory", ".", "."],
            [".", "ReadLatency", ".", "."],
            [".", "WriteLatency", ".", "."]
          ]
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          title  = "Database Metrics"
          period = var.dashboard_period
        }
      },
      # Cache Metrics
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/ElastiCache", "CPUUtilization", "CacheClusterId", var.cache_cluster_id],
            [".", "DatabaseMemoryUsagePercentage", ".", "."],
            [".", "CurrConnections", ".", "."],
            [".", "Evictions", ".", "."],
            [".", "CacheHitRate", ".", "."]
          ]
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          title  = "Cache Metrics"
          period = var.dashboard_period
        }
      },
      # WAF Metrics
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/WAFV2", "AllowedRequests", "WebACL", var.waf_web_acl_name, "Rule", "ALL", "Region", var.aws_region],
            [".", "BlockedRequests", ".", ".", ".", ".", ".", "."],
            [".", "SampledRequests", ".", ".", ".", ".", ".", "."]
          ]
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          title  = "WAF Security Metrics"
          period = var.dashboard_period
        }
      },
      # Application Error Rate
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          metrics = [
            [{
              expression = "m2/m1*100"
              label      = "Error Rate %"
              id         = "e1"
            }],
            [{
              expression = "ANOMALY_DETECTION_FUNCTION(e1, 2)"
              label      = "Error Rate (expected)"
              id         = "ad1"
            }],
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", var.load_balancer_arn_suffix, { id = "m1", visible = false }],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", { id = "m2", visible = false }]
          ]
          view   = "timeSeries"
          stacked = false
          region = var.aws_region
          title  = "Application Error Rate"
          period = var.dashboard_period
        }
      }
    ]
  })
  
  tags = var.tags
}

# Application Load Balancer Alarms
resource "aws_cloudwatch_metric_alarm" "alb_response_time" {
  alarm_name          = "${var.project_name}-${var.environment}-alb-high-response-time"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = "300"
  statistic           = "Average"
  threshold           = var.response_time_threshold / 1000  # Convert to seconds
  alarm_description   = "Average response time is too high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    LoadBalancer = var.load_balancer_arn_suffix
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "alb_error_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-alb-high-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  threshold           = var.error_rate_threshold
  alarm_description   = "Application error rate is too high"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  treat_missing_data  = "notBreaching"
  
  metric_query {
    id          = "e1"
    expression  = "m2/m1*100"
    label       = "Error Rate"
    return_data = "true"
  }
  
  metric_query {
    id = "m1"
    metric {
      metric_name = "RequestCount"
      namespace   = "AWS/ApplicationELB"
      period      = "300"
      stat        = "Sum"
      
      dimensions = {
        LoadBalancer = var.load_balancer_arn_suffix
      }
    }
  }
  
  metric_query {
    id = "m2"
    metric {
      metric_name = "HTTPCode_Target_5XX_Count"
      namespace   = "AWS/ApplicationELB"
      period      = "300"
      stat        = "Sum"
      
      dimensions = {
        LoadBalancer = var.load_balancer_arn_suffix
      }
    }
  }
  
  tags = var.tags
}

# ECS Service Alarms
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_threshold_warning
  alarm_description   = "ECS CPU utilization is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_cpu_critical" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-cpu-critical"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_threshold_critical
  alarm_description   = "ECS CPU utilization is critical"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "ecs_memory_high" {
  alarm_name          = "${var.project_name}-${var.environment}-ecs-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.memory_threshold_warning
  alarm_description   = "ECS memory utilization is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    ServiceName = var.ecs_service_name
    ClusterName = var.ecs_cluster_name
  }
  
  tags = var.tags
}

# Database Alarms
resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "3"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_threshold_warning
  alarm_description   = "Database CPU utilization is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    DBInstanceIdentifier = var.database_instance_id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name          = "${var.project_name}-${var.environment}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "Database connection count is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    DBInstanceIdentifier = var.database_instance_id
  }
  
  tags = var.tags
}

# Cache Alarms
resource "aws_cloudwatch_metric_alarm" "cache_cpu_high" {
  alarm_name          = "${var.project_name}-${var.environment}-cache-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.cpu_threshold_warning
  alarm_description   = "Cache CPU utilization is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    CacheClusterId = var.cache_cluster_id
  }
  
  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "cache_memory_high" {
  alarm_name          = "${var.project_name}-${var.environment}-cache-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = "300"
  statistic           = "Average"
  threshold           = var.memory_threshold_warning
  alarm_description   = "Cache memory usage is high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions         = [aws_sns_topic.alerts.arn]
  
  dimensions = {
    CacheClusterId = var.cache_cluster_id
  }
  
  tags = var.tags
}

# Log-based Alarms
resource "aws_cloudwatch_log_metric_filter" "application_errors" {
  name           = "${var.project_name}-${var.environment}-application-errors"
  log_group_name = var.application_log_group_name
  pattern        = "[timestamp, request_id, level=\"ERROR\", ...]"
  
  metric_transformation {
    name      = "ApplicationErrors"
    namespace = "XORJ/Application"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "application_errors" {
  alarm_name          = "${var.project_name}-${var.environment}-application-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApplicationErrors"
  namespace           = "XORJ/Application"
  period              = "300"
  statistic           = "Sum"
  threshold           = "10"
  alarm_description   = "High number of application errors detected"
  alarm_actions       = [aws_sns_topic.critical_alerts.arn]
  treat_missing_data  = "notBreaching"
  
  tags = var.tags
}

# Composite Alarm for Overall System Health
resource "aws_cloudwatch_composite_alarm" "system_health" {
  alarm_name        = "${var.project_name}-${var.environment}-system-health"
  alarm_description = "Overall system health based on multiple metrics"
  
  alarm_rule = join(" OR ", [
    "ALARM(${aws_cloudwatch_metric_alarm.ecs_cpu_critical.alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.alb_error_rate.alarm_name})",
    "ALARM(${aws_cloudwatch_metric_alarm.application_errors.alarm_name})"
  ])
  
  alarm_actions = [aws_sns_topic.critical_alerts.arn]
  ok_actions   = [aws_sns_topic.alerts.arn]
  
  tags = var.tags
}