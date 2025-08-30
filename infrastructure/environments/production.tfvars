# Production Environment Configuration
# Terraform variables file for production deployment

# Basic Configuration
project_name = "xorj"
environment  = "production"
aws_region   = "us-east-1"

# Network Configuration
vpc_cidr                 = "10.0.0.0/16"
availability_zones_count = 3
public_subnet_cidrs     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs    = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
database_subnet_cidrs   = ["10.0.201.0/24", "10.0.202.0/24", "10.0.203.0/24"]
allowed_cidr_blocks     = ["0.0.0.0/0"]

# Database Configuration
db_instance_class          = "db.r6g.large"
db_allocated_storage       = 100
db_max_allocated_storage   = 1000
backup_retention_period    = 30
backup_window             = "03:00-04:00"
maintenance_window        = "Sun:04:00-Sun:05:00"
multi_az                  = true
deletion_protection       = true

# Cache Configuration
redis_node_type              = "cache.r6g.large"
redis_num_cache_nodes        = 2
redis_engine_version         = "7.0"
redis_port                   = 6379
redis_maintenance_window     = "sun:05:00-sun:06:00"
redis_snapshot_retention_limit = 7
redis_snapshot_window        = "06:00-08:00"
auth_token_enabled          = true
transit_encryption_enabled  = true
at_rest_encryption_enabled  = true
automatic_failover_enabled  = true
multi_az_enabled           = true

# ECS Configuration
ecs_cpu           = 1024
ecs_memory        = 2048
ecs_desired_count = 3
ecs_min_capacity  = 2
ecs_max_capacity  = 20

# Application Configuration
container_port            = 3000
health_check_path         = "/api/health"
health_check_interval     = 30
health_check_timeout      = 5
health_check_healthy_threshold   = 2
health_check_unhealthy_threshold = 3

# SSL Configuration (replace with your actual certificate ARN)
domain_name     = "xorj.com"
certificate_arn = ""

# Monitoring Configuration
notification_email = ""
notification_phone = ""

# Alert Thresholds
cpu_threshold_warning     = 70
cpu_threshold_critical    = 85
memory_threshold_warning  = 75
memory_threshold_critical = 90
response_time_threshold   = 2000
error_rate_threshold      = 5