# Staging Environment Configuration
# Terraform variables file for staging deployment

# Basic Configuration
project_name = "xorj"
environment  = "staging"
aws_region   = "us-east-1"

# Network Configuration
vpc_cidr                 = "10.1.0.0/16"
availability_zones_count = 2
public_subnet_cidrs     = ["10.1.1.0/24", "10.1.2.0/24"]
private_subnet_cidrs    = ["10.1.101.0/24", "10.1.102.0/24"]
database_subnet_cidrs   = ["10.1.201.0/24", "10.1.202.0/24"]
allowed_cidr_blocks     = ["0.0.0.0/0"]

# Database Configuration
db_instance_class          = "db.t3.medium"
db_allocated_storage       = 50
db_max_allocated_storage   = 200
backup_retention_period    = 7
backup_window             = "03:00-04:00"
maintenance_window        = "Sun:04:00-Sun:05:00"
multi_az                  = false
deletion_protection       = false

# Cache Configuration
redis_node_type              = "cache.t3.medium"
redis_num_cache_nodes        = 1
redis_engine_version         = "7.0"
redis_port                   = 6379
redis_maintenance_window     = "sun:05:00-sun:06:00"
redis_snapshot_retention_limit = 3
redis_snapshot_window        = "06:00-08:00"
auth_token_enabled          = true
transit_encryption_enabled  = true
at_rest_encryption_enabled  = true
automatic_failover_enabled  = false
multi_az_enabled           = false

# ECS Configuration
ecs_cpu           = 512
ecs_memory        = 1024
ecs_desired_count = 2
ecs_min_capacity  = 1
ecs_max_capacity  = 10

# Application Configuration
container_port            = 3000
health_check_path         = "/api/health"
health_check_interval     = 30
health_check_timeout      = 5
health_check_healthy_threshold   = 2
health_check_unhealthy_threshold = 3

# SSL Configuration
domain_name     = "staging.xorj.com"
certificate_arn = ""

# Monitoring Configuration
notification_email = ""
notification_phone = ""

# Alert Thresholds
cpu_threshold_warning     = 80
cpu_threshold_critical    = 90
memory_threshold_warning  = 80
memory_threshold_critical = 95
response_time_threshold   = 3000
error_rate_threshold      = 10