# VibeForge

> A self-hosted, open-source vibe coding app that deploys fully functional full-stack applications to your AWS account using **Amazon Bedrock** for AI-powered code generation and **AWS CDK** for infrastructure deployment.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Real AWS Integration**: Uses Amazon Bedrock (Claude) for AI-powered app generation—no mocks
- **Functional Code Generation**: Bedrock generates working React components with hooks, API calls, and forms—not just specs
- **Auto-Connected Setup**: Automatic IAM role provisioning on startup—no manual CloudFormation steps
- **Two Deployment Environments**: Separate dev and prod stacks with isolated resources
- **Two Blueprints**:
  - **Serverless**: API Gateway + Lambda + DynamoDB + S3 + CloudFront
  - **Containers**: ECS Fargate + ALB + Aurora Serverless v2 + ECR
- **Infrastructure as Code**: AWS CDK (TypeScript) for all deployments
- **Secure Access**: STS AssumeRole with ExternalId for role assumption
- **Preview URLs**: Instant CloudFront URLs for dev and prod environments
- **Permissions Boundary**: Enforces tagging and scoped permissions

## 📋 Prerequisites

- Docker & Docker Compose
- AWS Account with:
  - Access to Amazon Bedrock in a supported region (us-east-1, us-west-2, etc.)
  - Model access enabled for Claude 3.5 Sonnet (or your chosen model)
  - Admin permissions to create IAM roles and CloudFormation stacks

## 🏃 Quick Start

### 1. Clone and Configure

```bash
git clone https://github.com/Hitheshaum/vibeforge.git
cd vibeforge

# Copy environment template
cp .env.example .env

# Edit .env with your AWS account ID
nano .env
```

**Required Environment Variables:**

```bash
# Your AWS Account ID
CONTROL_PLANE_ACCOUNT_ID=123456789012

# AWS Credentials (with admin access to create IAM roles and deploy infrastructure)
AWS_ACCESS_KEY_ID=your-access-key-here
AWS_SECRET_ACCESS_KEY=your-secret-key-here

# Configuration
ROLE_NAME=VibeDeployerRole
DEFAULT_REGION=us-east-1
BEDROCK_REGION=us-east-1               # Must be Bedrock-supported
BEDROCK_MODEL_ID=amazon.titan-text-express-v1  # No approval needed (or use Claude for better quality)
NEXT_PUBLIC_API_BASE=http://localhost:4000
```

**Get AWS Credentials:**

```bash
# From AWS Console: IAM → Users → Security Credentials → Create Access Key
# Or from CLI:
aws configure get aws_access_key_id
aws configure get aws_secret_access_key
```

### 2. Start Services

```bash
# Build and start all services
make build
make up

# Or with docker compose directly
docker compose up --build
```

The UI will be available at **http://localhost:3000**

On startup, the control service will automatically:
- Create a CloudFormation stack with the IAM role (`VibeDeployerRole`)
- Set up permissions boundary (`VibePermissionsBoundary`)
- Create an S3 bucket for CDK artifacts (`vibe-artifacts-*`)
- Verify the connection to your AWS account

Check the logs to see the connection status:
```bash
docker compose logs control | grep "Connected to AWS"
```

### 3. Generate Your First App

1. Enter an **App Name** (e.g., `my-todo-app`)
2. Select a **Blueprint** (Serverless or Containers)
3. Describe your app in the prompt:
   ```
   A todo app with users and tags. Users can create, edit, and delete todos.
   Each todo has a title, description, status, and multiple tags.
   ```
4. Click **"Generate & Preview"**

The platform will:
- Call Amazon Bedrock to generate an app specification
- Call Amazon Bedrock again to generate functional React component code
- Render a complete repository with CDK infrastructure and working UI
- Deploy the dev stack to your AWS account
- Return a CloudFront preview URL with your functional app

### 4. Publish to Production

Once you've tested the preview:
1. Click **"Publish to Prod"**
2. Confirm the deployment
3. Get your production URL

## 🏗️ Architecture

### System Architecture

```
┌─────────────────┐
│   User Browser  │
│  localhost:3000 │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Docker Compose                   │
│  ┌──────────────┐    ┌───────────────┐  │
│  │  UI Service  │◄───┤ Control Svc   │  │
│  │  (Next.js)   │    │  (Express)    │  │
│  │  Port 3000   │    │  Port 4000    │  │
│  └──────────────┘    └───────┬───────┘  │
│                              │           │
└──────────────────────────────┼───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   AWS Account        │
                    │                      │
                    │  ┌───────────────┐   │
                    │  │ STS AssumeRole│   │
                    │  │  + ExternalId │   │
                    │  └───────┬───────┘   │
                    │          │           │
                    │          ▼           │
                    │  ┌───────────────┐   │
                    │  │ Amazon Bedrock│   │
                    │  │  (Claude 3.5) │   │
                    │  └───────────────┘   │
                    │          │           │
                    │          ▼           │
                    │  ┌───────────────┐   │
                    │  │   AWS CDK     │   │
                    │  │   Bootstrap   │   │
                    │  └───────┬───────┘   │
                    │          │           │
                    │          ▼           │
                    │  ┌───────────────┐   │
                    │  │ CloudFormation│   │
                    │  │  Deploy Stacks│   │
                    │  └───────────────┘   │
                    │                      │
                    └──────────────────────┘
```

### Generated App Architecture

**Serverless Blueprint:**
```
CloudFront → S3 (Static Web)
           ↓
     API Gateway → Lambda Functions → DynamoDB Tables
                                   ↓
                            (Optional) Cognito
```

**Containers Blueprint:**
```
CloudFront → S3 (Static Web)
           ↓
CloudFront → ALB → ECS Fargate Service → Aurora Serverless v2
                                       ↓
                                     ECR (Docker Images)
```

## 🔐 Security Model

### Cross-Account Access

- **No Static Credentials**: Only STS AssumeRole with ExternalId
- **Tenant Isolation**: Unique ExternalId per installation (stored in `/data/tenant.json`)
- **Trust Policy**: Role only trusts your control plane account ID + ExternalId match

### Permissions Boundary

The `VibePermissionsBoundary` enforces:
- **Required Tags**: All resources must have `AppId` and `Env` tags
- **Service Scoping**: Limited to CloudFormation, S3, Lambda, DynamoDB, ECS, RDS, etc.
- **IAM Restrictions**: Can only create roles with the same boundary attached
- **Bedrock Access**: Allows InvokeModel for spec generation

### Revoke Access

To revoke access, delete the CloudFormation stack (removes IAM role and permissions):

```bash
aws cloudformation delete-stack --stack-name VibeDeployerStack --region us-east-1
```

Note: The stack is automatically created on startup if it doesn't exist. After deleting, restart the control service to recreate it.

## 🧪 Blueprints

### Serverless (Default)

**Generated Resources:**
- S3 Bucket + CloudFront Distribution (web hosting)
- API Gateway REST API
- Lambda Functions (one per API endpoint)
- DynamoDB Tables (from data model spec)
- Optional Cognito User Pool (if auth enabled)
- CloudWatch Logs

**Use Cases:**
- APIs and microservices
- CRUD applications
- Event-driven workflows
- Cost-optimized workloads

**Example Prompt:**
```
A blog platform with posts, comments, and user profiles.
Users can create posts with markdown content, add tags,
and comment on other posts. Include authentication.
```

### Containers

**Generated Resources:**
- VPC with public/private subnets
- ECS Fargate Cluster + Service
- Application Load Balancer (ALB)
- Aurora Serverless v2 PostgreSQL Cluster
- ECR Repository
- CloudFront + S3 (frontend)
- CloudWatch Logs

**Use Cases:**
- Complex applications requiring stateful containers
- Relational database requirements
- Long-running processes
- WebSocket servers

**Example Prompt:**
```
A real-time chat application with rooms and user presence.
Users can create rooms, invite others, and send messages.
Store message history in PostgreSQL.
```

## 🛠️ Bedrock Configuration

### Enabling Model Access

**Note**: As of 2024, AWS Bedrock automatically enables access to all serverless foundation models. The old "Model access" page has been retired.

If you see an access denied error:

1. For **Anthropic models** (Claude), first-time users may need to submit use case details
2. Go to [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/) → Model catalog
3. Find **Claude 3.5 Sonnet** (or your configured model)
4. Click **"Try in playground"** to complete first-time setup
5. Submit use case details if prompted (usually instant approval)
6. Retry in the UI

For other access issues, verify your IAM user/role has `bedrock:InvokeModel` permissions.

### Supported Regions

- `us-east-1` (N. Virginia) ✅
- `us-west-2` (Oregon) ✅
- `eu-central-1` (Frankfurt) ✅
- `eu-west-3` (Paris) ✅
- `ap-southeast-1` (Singapore) ✅
- `ap-northeast-1` (Tokyo) ✅

### Supported Models

Edit `BEDROCK_MODEL_ID` in `.env`:

```bash
# Amazon Titan (No approval needed - recommended for getting started)
BEDROCK_MODEL_ID=amazon.titan-text-express-v1      # Fast, free, no approval
BEDROCK_MODEL_ID=amazon.titan-text-lite-v1         # Lighter version
BEDROCK_MODEL_ID=amazon.titan-text-premier-v1:0    # Most capable Titan

# Anthropic Claude (May require use case submission for first-time users)
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0  # Best quality
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0     # Faster, cheaper
```

**Default**: The project now uses `amazon.titan-text-express-v1` by default, which requires no approval and is immediately available.

## 📂 Repository Structure

```
vibeforge/
├── docker-compose.yml          # Service orchestration
├── Makefile                    # Convenience commands
├── .env.example                # Environment template
├── packages/
│   └── shared/                 # Shared TypeScript types
├── services/
│   ├── control/                # Express API server
│   │   ├── src/
│   │   │   ├── index.ts        # API routes
│   │   │   ├── connect.ts      # AWS connection logic
│   │   │   ├── bedrock.ts      # Bedrock integration
│   │   │   ├── deploy.ts       # CDK deployment
│   │   │   ├── scaffold/       # Code generation
│   │   │   │   ├── blueprints/
│   │   │   │   │   ├── serverless/  # Lambda templates
│   │   │   │   │   └── containers/  # ECS templates
│   │   │   └── util/           # Utilities
│   │   └── cloudformation/
│   │       └── connect-min.json     # Quick-Create template
│   └── ui/                     # Next.js frontend
│       └── src/
│           ├── pages/
│           │   └── index.tsx   # Main UI
│           └── lib/
│               └── api.ts      # API client
└── work/                       # Generated apps (gitignored)
```

## 🔧 Development

### Local Commands

```bash
# Start services
make up

# View logs
make logs

# Restart services
make restart

# Stop services
make down

# Clean generated apps
make clean

# Run tests
make test
```

### Manual Commands

```bash
# Install dependencies
cd packages/shared && npm install
cd services/control && npm install
cd services/ui && npm install

# Build shared package
cd packages/shared && npm run build

# Run control service
cd services/control && npm run dev

# Run UI service
cd services/ui && npm run dev
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONTROL_PLANE_ACCOUNT_ID` | Your AWS account ID | Required |
| `AWS_ACCESS_KEY_ID` | AWS access key | Required |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | Required |
| `ROLE_NAME` | IAM role name | `VibeDeployerRole` |
| `DEFAULT_REGION` | Default AWS region | `us-east-1` |
| `BEDROCK_REGION` | Bedrock-supported region | `us-east-1` |
| `BEDROCK_MODEL_ID` | Bedrock model ID | `amazon.titan-text-express-v1` |
| `NEXT_PUBLIC_API_BASE` | Control API URL | `http://localhost:4000` |

## 🐛 Troubleshooting

### "Access denied to Bedrock model"

**Symptom**: Bedrock returns AccessDeniedException

**Solution**:
1. For Anthropic models (Claude), first-time users may need to submit use case details
2. Go to AWS Console → Bedrock → Model catalog
3. Select the model specified in `BEDROCK_MODEL_ID`
4. Click "Try in playground" to complete setup
5. Submit use case details if prompted (usually instant approval)
6. Verify IAM permissions include `bedrock:InvokeModel`

### "Not connected" message in UI

**Symptom**: UI shows "✗ Not connected. Check AWS credentials in .env"

**Solution**:
1. Verify AWS credentials in `.env` are correct and have admin permissions
2. Check control service logs: `docker compose logs control`
3. Verify `CONTROL_PLANE_ACCOUNT_ID` matches your AWS account ID
4. Ensure CloudFormation stack `VibeDeployerStack` was created successfully:
   ```bash
   aws cloudformation describe-stacks --stack-name VibeDeployerStack --region us-east-1
   ```
5. Check ExternalId matches (auto-generated, stored in `/data/tenant.json`)

### "CDK bootstrap failed"

**Symptom**: Deployment fails during bootstrap

**Solution**:
1. Manually bootstrap CDK:
   ```bash
   aws configure  # Use credentials with admin access
   cdk bootstrap aws://ACCOUNT-ID/REGION
   ```
2. Verify IAM permissions boundary allows CDK operations
3. Check CloudFormation quota limits

### "Permission denied" errors

**Symptom**: CDK deploy fails with IAM errors

**Solution**:
1. Verify the `VibePermissionsBoundary` is attached to the role
2. Ensure all resources have `AppId` and `Env` tags
3. Check that the role trusts the control plane account
4. Review CloudWatch Logs for detailed error messages

### Docker issues

**Symptom**: Services won't start

**Solution**:
```bash
# Rebuild containers
docker compose build --no-cache

# Check logs
docker compose logs -f control
docker compose logs -f ui

# Restart
docker compose down && docker compose up
```

## 📊 Generated App Structure

When you generate an app, the following structure is created in `/work/<app-id>/`:

```
my-app/
├── .vibe/
│   └── manifest.json           # App metadata + deployment info
├── infra/                      # CDK infrastructure
│   ├── bin/infra.ts            # CDK app entry
│   ├── lib/app-stack.ts        # Stack definition
│   ├── cdk.json                # CDK config
│   └── package.json
├── web/                        # Next.js frontend
│   ├── src/
│   │   └── pages/
│   │       └── index.tsx
│   ├── next.config.js
│   └── package.json
├── api/                        # Backend
│   ├── src/
│   │   ├── handlers/           # Lambda handlers (serverless)
│   │   └── server.ts           # Express server (containers)
│   ├── Dockerfile              # (containers only)
│   └── package.json
└── README.md                   # App-specific docs
```

## 🚢 Deployment Flow

1. **User submits prompt** → UI sends to control service
2. **Control service**:
   - Assumes role in target account
   - Calls Bedrock to generate app spec (JSON)
   - Calls Bedrock to generate functional React components (TypeScript/TSX)
   - Writes generated code and templates to repository
   - Initializes git repo
3. **CDK deployment**:
   - Bootstraps CDK (if needed)
   - Synthesizes CloudFormation template
   - Deploys dev stack
   - Extracts outputs (URLs, ARNs)
4. **Returns preview URL** to user
5. **User publishes** → deploys prod stack

## 📜 License

MIT License - see [LICENSE](LICENSE) file

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 🙏 Acknowledgments

- Powered by [Amazon Bedrock](https://aws.amazon.com/bedrock/)
- Built with [AWS CDK](https://aws.amazon.com/cdk/)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Hitheshaum/vibeforge/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Hitheshaum/vibeforge/discussions)

## 🗺️ Roadmap

- [ ] Custom domain support (Route53 + ACM)
- [ ] CI/CD integration (GitHub Actions)
- [ ] Database migrations
- [ ] Monitoring dashboards (CloudWatch)
- [ ] Cost estimation
- [ ] Multi-region deployments
- [ ] Slack/Discord notifications
- [ ] Terraform support

---

**Built with ❤️ for the developer community**
