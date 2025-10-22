# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-XX

### Added
- Initial release of AWS Vibe Starter
- Cross-account AWS deployment with STS AssumeRole
- Amazon Bedrock integration for AI-powered spec generation
- Two deployment blueprints: Serverless and Containers
- CloudFormation Quick-Create for IAM role setup
- Permissions boundary for scoped access
- Dev and Prod environment separation
- Docker Compose orchestration
- Next.js UI with dark theme
- Express control service API
- AWS CDK infrastructure templates
- Comprehensive README and documentation

### Serverless Blueprint
- API Gateway + Lambda + DynamoDB
- S3 + CloudFront for static hosting
- Optional Cognito authentication
- CloudWatch Logs integration

### Containers Blueprint
- ECS Fargate + Application Load Balancer
- Aurora Serverless v2 (PostgreSQL)
- ECR for container registry
- VPC with public/private subnets
- CloudFront + S3 for frontend

### Security
- No static AWS credentials
- ExternalId-based trust policy
- Resource tagging enforcement
- IAM permissions boundary

## [Unreleased]

### Planned
- Custom domain support (Route53 + ACM)
- CI/CD integration (GitHub Actions)
- Database migrations
- Monitoring dashboards
- Cost estimation
- Multi-region deployments
- Terraform support
