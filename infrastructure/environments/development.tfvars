# Development Environment Configuration
# Terraform variables file for development deployment

# Basic Configuration
project_name = "xorj"
environment  = "development"
aws_region   = "us-east-1"

# Network Configuration
vpc_cidr                 = "10.2.0.0/16"
availability_zones_count = 2
public_subnet_cidrs     = ["10.2.1.0/24", "10.2.2.0/24"]
private_subnet_cidrs    = ["10.2.101.0/24", "10.2.102.0/24"]
database_subnet_cidrs   = ["10.2.201.0/24", "10.2.202.0/24"]
allowed_cidr_blocks     = ["0.0.0.0/0"]

# Database Configuration
db_instance_class          = "db.t3.micro"
db_allocated_storage       = 20
db_max_allocated_storage   = 50
backup_retention_period    = 3
backup_window             = "03:00-04:00"
maintenance_window        = "Sun:04:00-Sun:05:00"
multi_az                  = false
deletion_protection       = false

# Cache Configuration
redis_node_type              = "cache.t3.micro"
redis_num_cache_nodes        = 1
redis_engine_version         = "7.0"
redis_port                   = 6379
redis_maintenance_window     = "sun:05:00-sun:06:00"
redis_snapshot_retention_limit = 1
redis_snapshot_window        = "06:00-08:00"
auth_token_enabled          = false
transit_encryption_enabled  = false
at_rest_encryption_enabled  = false
automatic_failover_enabled  = false
multi_az_enabled           = false

# ECS Configuration
ecs_cpu           = 256
ecs_memory        = 512
ecs_desired_count = 1
ecs_min_capacity  = 1
ecs_max_capacity  = 3

# Application Configuration
container_port            = 3000
health_check_path         = "/api/health"
health_check_interval     = 60
health_check_timeout      = 10
health_check_healthy_threshold   = 2
health_check_unhealthy_threshold = 5

# SSL Configuration
domain_name     = "dev.xorj.com"
certificate_arn = ""

# Monitoring Configuration
notification_email = ""
notification_phone = ""

# Alert Thresholds
cpu_threshold_warning     = 85
cpu_threshold_critical    = 95
memory_threshold_warning  = 85
memory_threshold_critical = 95
response_time_threshold   = 5000
error_rate_threshold      = 20