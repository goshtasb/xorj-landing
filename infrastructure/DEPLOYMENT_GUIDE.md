# XORJ Infrastructure Deployment Guide

This guide provides step-by-step instructions for deploying the XORJ Trading Platform infrastructure using Terraform.

## Prerequisites

1. **AWS CLI** configured with appropriate permissions
2. **Terraform** installed (version >= 1.0)
3. **AWS Account** with sufficient permissions for:
   - VPC, EC2, RDS, ElastiCache resources
   - IAM roles and policies
   - KMS keys and Secrets Manager
   - ECS/Fargate, Application Load Balancer
   - CloudWatch, WAF, and S3 buckets

## Directory Structure

```
infrastructure/
├── main.tf                    # Root configuration
├── backend.tf                 # Remote backend configuration
├── backend-setup.tf           # Backend setup resources
├── variables.tf               # Variable definitions
├── outputs.tf                 # Output definitions
├── environments/              # Environment-specific configurations
│   ├── development.tfvars
│   ├── staging.tfvars
│   └── production.tfvars
└── modules/                   # Reusable infrastructure modules
    ├── networking/
    ├── security/
    ├── database/
    ├── cache/
    ├── compute/
    └── monitoring/
```

## Deployment Process

### Step 1: Initialize Backend Infrastructure

Before using the remote backend, you need to create the S3 bucket and DynamoDB table.

```bash
# Navigate to infrastructure directory
cd infrastructure

# Initialize Terraform with local backend
terraform init

# Create backend resources (S3 bucket and DynamoDB table)
terraform apply -target=aws_s3_bucket.terraform_state -target=aws_dynamodb_table.terraform_locks
```

### Step 2: Configure Remote Backend

After the backend resources are created, configure the remote backend:

```bash
# Uncomment the backend configuration in backend.tf
# Update the bucket name to match your project

# Reinitialize with remote backend
terraform init -migrate-state
```

### Step 3: Deploy Development Environment

```bash
# Plan the deployment
terraform plan -var-file="environments/development.tfvars"

# Apply the configuration
terraform apply -var-file="environments/development.tfvars"
```

### Step 4: Deploy Staging Environment

```bash
# Switch workspace or use separate state files
terraform workspace new staging  # Optional: use workspaces

# Plan and apply
terraform plan -var-file="environments/staging.tfvars"
terraform apply -var-file="environments/staging.tfvars"
```

### Step 5: Deploy Production Environment

```bash
# Switch to production workspace
terraform workspace new production  # Optional: use workspaces

# Plan and apply with extra care
terraform plan -var-file="environments/production.tfvars" -out=production.tfplan
terraform apply production.tfplan
```

## Configuration Customization

### Essential Variables to Update

Before deployment, update the following variables in your `.tfvars` files:

1. **Notification Settings**:
   ```hcl
   notification_email = "ops@yourcompany.com"
   notification_phone = "+1234567890"  # For SMS alerts
   ```

2. **SSL Certificate**:
   ```hcl
   certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/..."
   domain_name     = "your-domain.com"
   ```

3. **Network Security** (optional):
   ```hcl
   allowed_cidr_blocks = ["your.office.ip/32"]  # Restrict access
   ```

## Environment-Specific Configurations

### Development
- Minimal resources for cost optimization
- Single AZ deployment
- Relaxed security settings for development ease
- No encryption at rest for cache

### Staging
- Production-like setup but smaller scale
- Multi-AZ database disabled for cost savings
- Moderate resource allocation
- Full security features enabled

### Production
- High availability with multi-AZ deployment
- Auto-scaling enabled
- Enhanced monitoring and alerting
- Full security hardening
- Backup and disaster recovery configured

## Post-Deployment Steps

### 1. Container Registry Setup

```bash
# Get ECR login token
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push your application image
docker build -t xorj .
docker tag xorj:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/xorj:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/xorj:latest
```

### 2. Database Migration

```bash
# Connect to RDS instance through bastion host or VPC endpoint
# Run your database migrations here
```

### 3. DNS Configuration

Update your DNS records to point to the Application Load Balancer:

```
# Get ALB DNS name from Terraform output
terraform output load_balancer_dns_name

# Create CNAME record: your-domain.com -> alb-dns-name
```

### 4. SSL Certificate (if not using existing)

```bash
# Request certificate through AWS Certificate Manager
aws acm request-certificate \
  --domain-name your-domain.com \
  --validation-method DNS \
  --region us-east-1

# Update terraform variables with certificate ARN
# Re-run terraform apply
```

## Monitoring and Alerting

### CloudWatch Dashboard
Access your dashboard at:
```
https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=xorj-{environment}-dashboard
```

### SNS Subscriptions
Email subscriptions are created automatically. Check your email to confirm subscriptions.

### Log Groups
Application logs are available in:
- `/aws/ecs/xorj-{environment}` - Application logs
- `/aws/vpc/flowlogs/xorj-{environment}` - VPC flow logs

## Troubleshooting

### Common Issues

1. **Permission Errors**:
   - Ensure your AWS credentials have sufficient permissions
   - Check IAM policies for Terraform execution

2. **Resource Limits**:
   - Verify AWS service limits in your region
   - Request limit increases if needed

3. **Certificate Issues**:
   - Ensure certificate is validated and in the same region
   - Check domain validation records

4. **Database Connection Issues**:
   - Verify security group rules
   - Check subnet routing
   - Confirm database credentials in Secrets Manager

### Useful Commands

```bash
# Check current state
terraform show

# Validate configuration
terraform validate

# Format code
terraform fmt -recursive

# Plan with detailed output
terraform plan -detailed-exitcode

# Import existing resources (if needed)
terraform import aws_s3_bucket.example bucket-name
```

## Security Considerations

1. **State File Security**: State files contain sensitive data. Ensure S3 bucket is properly secured and encrypted.

2. **Access Control**: Use IAM roles and policies to restrict access to infrastructure resources.

3. **Network Security**: Review security group rules and NACLs regularly.

4. **Secret Management**: All sensitive data is stored in AWS Secrets Manager with KMS encryption.

5. **Monitoring**: Enable CloudTrail for all API calls and set up appropriate alerting.

## Cost Optimization

1. **Right-sizing**: Monitor resource utilization and adjust instance sizes accordingly.

2. **Auto-scaling**: Configure appropriate scaling policies to handle varying loads.

3. **Reserved Instances**: Consider reserved instances for production workloads.

4. **Lifecycle Policies**: Automated cleanup of old snapshots, logs, and container images.

## Backup and Disaster Recovery

1. **Database Backups**: Automated daily backups with point-in-time recovery.

2. **Cross-Region Replication**: Consider setting up cross-region replicas for critical data.

3. **Infrastructure as Code**: This Terraform configuration serves as your infrastructure backup.

## Next Steps

1. Set up CI/CD pipeline for application deployments
2. Implement blue-green or canary deployment strategies
3. Set up log aggregation and analysis
4. Configure additional monitoring and observability tools
5. Implement infrastructure testing and compliance checks

For questions or support, refer to the AWS documentation or contact your DevOps team.