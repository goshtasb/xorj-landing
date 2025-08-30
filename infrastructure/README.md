# XORJ Trading Platform - Infrastructure as Code

This directory contains the complete Terraform configuration for XORJ's production cloud infrastructure on AWS.

## Architecture Overview

The infrastructure is designed with security, scalability, and reliability in mind:

```
Internet
    ↓
CloudFront (CDN) + WAF
    ↓
Application Load Balancer (ALB)
    ↓
ECS Fargate Cluster (Auto-scaling)
    ↓
Private Subnets
    ↓
RDS PostgreSQL + ElastiCache Redis
```

## Directory Structure

```
infrastructure/
├── main.tf                    # Root configuration
├── variables.tf               # Input variables
├── outputs.tf                 # Output values
├── backend.tf                 # Remote state configuration
├── environments/
│   ├── staging/              # Staging environment
│   └── production/           # Production environment
├── modules/
│   ├── networking/           # VPC, subnets, security groups
│   ├── database/            # RDS PostgreSQL
│   ├── cache/               # ElastiCache Redis
│   ├── compute/             # ECS Fargate
│   ├── security/            # IAM, secrets, certificates
│   └── monitoring/          # CloudWatch, alarms
└── scripts/
    ├── deploy.sh            # Deployment script
    └── validate.sh          # Configuration validation
```

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** v1.5+ installed
3. **Docker** for local testing
4. **AWS Account** with appropriate permissions
5. **Domain Name** registered and DNS configured

## Quick Start

1. **Clone and Navigate**
   ```bash
   cd infrastructure
   ```

2. **Configure Backend**
   ```bash
   terraform init
   ```

3. **Plan Infrastructure**
   ```bash
   terraform plan -var-file="environments/staging/terraform.tfvars"
   ```

4. **Deploy Infrastructure**
   ```bash
   terraform apply -var-file="environments/staging/terraform.tfvars"
   ```

## Environment Configuration

### Staging Environment
- **Instance Types**: t3.medium (cost-optimized)
- **Database**: db.t3.micro (single AZ)
- **Redis**: cache.t3.micro (single node)
- **Auto-scaling**: 1-3 containers

### Production Environment
- **Instance Types**: c5.large (performance-optimized)
- **Database**: db.r5.large (Multi-AZ)
- **Redis**: cache.r5.large (cluster mode)
- **Auto-scaling**: 2-10 containers

## Security Features

- **Network Isolation**: Private subnets for all backend services
- **Encryption**: All data encrypted at rest and in transit
- **Secrets Management**: AWS Secrets Manager integration
- **IAM**: Least privilege access policies
- **VPC Flow Logs**: Network traffic monitoring
- **Security Groups**: Strict port and protocol restrictions

## Cost Optimization

- **Spot Instances**: Where appropriate for development
- **Reserved Instances**: For predictable production workloads
- **Auto-scaling**: Scale down during low usage periods
- **Resource Tagging**: For cost allocation and tracking
- **Lifecycle Policies**: Automated cleanup of unused resources

## Monitoring & Alerting

- **CloudWatch Metrics**: Application and infrastructure monitoring
- **Custom Dashboards**: Real-time performance visualization
- **Automated Alerts**: Email/SMS notifications for critical issues
- **Log Aggregation**: Centralized logging with CloudWatch Logs

## Disaster Recovery

- **Multi-AZ Deployment**: High availability across availability zones
- **Automated Backups**: Daily RDS and Redis snapshots
- **Cross-Region Replication**: Critical data backup to secondary region
- **Infrastructure Recovery**: Complete infrastructure recreation from code

## Usage Examples

### Deploy Staging Environment
```bash
# Initialize Terraform
terraform init

# Plan changes
terraform plan -var-file="environments/staging/terraform.tfvars"

# Apply changes
terraform apply -var-file="environments/staging/terraform.tfvars"
```

### Deploy Production Environment
```bash
# Switch to production workspace
terraform workspace select production

# Plan production changes
terraform plan -var-file="environments/production/terraform.tfvars"

# Apply with approval
terraform apply -var-file="environments/production/terraform.tfvars"
```

### Update Specific Module
```bash
# Target specific module update
terraform plan -target=module.database
terraform apply -target=module.database
```

## Troubleshooting

### Common Issues

1. **State Lock Errors**
   ```bash
   terraform force-unlock <LOCK_ID>
   ```

2. **Resource Conflicts**
   ```bash
   terraform import aws_instance.example i-1234567890abcdef0
   ```

3. **Version Compatibility**
   ```bash
   terraform version
   terraform providers
   ```

## Contributing

1. **Branch Strategy**: Use feature branches for infrastructure changes
2. **Testing**: Test in staging before production deployment
3. **Documentation**: Update README for any architectural changes
4. **Code Review**: All changes require peer review
5. **Approval**: Production changes require lead architect approval

## Security Considerations

- **Never commit secrets** to version control
- **Use AWS Secrets Manager** for sensitive configuration
- **Enable MFA** for all AWS console access
- **Regular security audits** using AWS Config
- **Least privilege** IAM policies only

## Support

- **Technical Lead**: [Lead Engineer Contact]
- **Infrastructure Team**: [Infrastructure Contact]
- **Emergency Escalation**: [Emergency Contact]
- **Documentation**: Internal wiki and AWS documentation

---

**Last Updated**: August 2025  
**Version**: 1.0  
**Status**: Production Ready