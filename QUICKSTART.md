# VibeForge - Quick Start Guide

Get your first app deployed in **under 10 minutes**!

## Prerequisites

- Docker & Docker Compose installed
- AWS Account with billing enabled
- AWS Account ID (12 digits)
- AWS credentials (access key ID and secret access key)

## Step 1: Configure Environment (1 minute)

```bash
cd vibeforge

# Copy the example and edit it
cp .env.example .env
nano .env
```

**Update these lines:**
```bash
CONTROL_PLANE_ACCOUNT_ID=123456789012  # ← Replace with YOUR account ID
AWS_ACCESS_KEY_ID=your-access-key      # ← Your AWS access key
AWS_SECRET_ACCESS_KEY=your-secret-key  # ← Your AWS secret key
```

**Optional:** Change Bedrock region if needed (must be Bedrock-supported):
```bash
BEDROCK_REGION=us-east-1  # or us-west-2, eu-central-1, etc.
```

Save and exit.

## Step 2: Start Services (2 minutes)

```bash
# Build and start all containers
docker compose up --build

# Or use Makefile
make build
make up
```

Wait for:
```
control_1  | [API] Control service listening on port 4000
ui_1       | ready - started server on 0.0.0.0:3000
```

## Step 3: Verify AWS Connection (1 minute)

1. **Open browser**: http://localhost:3000

2. **Check connection status**: You should see "✓ Connected to AWS" at the top

   The control service automatically:
   - Creates a CloudFormation stack with IAM role (`VibeDeployerStack`)
   - Sets up permissions boundary
   - Verifies the connection

3. **If not connected**, check logs:
   ```bash
   docker compose logs control
   ```

## Step 4: Bedrock Model Access (Optional)

**By default**, VibeForge uses `amazon.titan-text-express-v1` which is immediately available without approval.

**For better quality** with Claude models:

1. If you see an access denied error, go to: https://console.aws.amazon.com/bedrock/
2. Navigate to **Model catalog**
3. Find **"Claude 3.5 Sonnet"**
4. Click **"Try in playground"** to complete first-time setup
5. Submit use case details if prompted (usually instant approval)

**Note:** AWS now automatically enables most models. You only need this step if using Anthropic Claude models for the first time.

## Step 5: Generate Your First App (3 minutes)

Back in the UI (http://localhost:3000):

1. **App Name**: `my-first-app`

2. **Blueprint**: Keep "Serverless" selected

3. **Prompt**:
   ```
   A simple todo application. Users can create, read, update, and delete todos.
   Each todo has a title, description, and completion status.
   ```

4. **Click**: "Generate & Preview"

5. **Wait** ~3-7 minutes while:
   - Bedrock generates the app specification
   - Bedrock generates functional React components
   - CDK deploys infrastructure
   - Web app is built and uploaded
   - CloudFront distribution is created

6. **Success!** You'll see a **Preview URL** like:
   ```
   https://d123abc456def.cloudfront.net
   ```

7. **Click the URL** to see your deployed app!

## Step 6: Publish to Production (Optional)

1. Click **"Publish to Prod"**
2. Confirm the deployment
3. Wait ~3-5 minutes
4. Get your **Production URL**

## 🎉 That's It!

You now have:
- ✅ A working Next.js app deployed to S3 + CloudFront
- ✅ API Gateway + Lambda backend
- ✅ DynamoDB database
- ✅ Full AWS CDK infrastructure

## What to Try Next

### Example Prompts

**E-commerce:**
```
A product catalog with shopping cart. Users can browse products,
add items to cart, and checkout. Include product categories and search.
```

**Blog Platform:**
```
A blog with posts, comments, and user profiles. Users can create posts
with markdown, add tags, and comment on posts. Include authentication.
```

**Task Manager:**
```
A team task manager with projects, tasks, and assignments. Tasks have
priorities, due dates, and can be assigned to team members.
```

### Try Containers Blueprint

1. Select **"Containers"** blueprint
2. Use same prompt
3. Get ECS Fargate + Aurora Serverless v2 deployment

### View Your Apps

Scroll down to **"Your Apps"** section to:
- See all deployed apps
- View dev and prod URLs
- Destroy environments when done

## Troubleshooting

### "Model access not enabled"

**You'll see a yellow banner with instructions:**
1. Click the link to AWS Console
2. Enable Claude 3.5 Sonnet
3. Return and click "Generate & Preview" again

### "Failed to assume role"

**Check:**
- CloudFormation stack created successfully
- Account ID is correct (12 digits, no spaces)
- Stack and app are in same region

### Logs

```bash
# View all logs
docker compose logs -f

# Control service only
docker compose logs -f control

# UI only
docker compose logs -f ui
```

## Cleanup

### Delete Generated Apps

In the UI, click **"Destroy Dev"** or **"Destroy Prod"** for each app.

### Revoke AWS Access

Delete the CloudFormation stack:

```bash
aws cloudformation delete-stack \
  --stack-name VibeDeployerStack \
  --region us-east-1
```

Or via AWS Console:
1. Go to CloudFormation
2. Select "VibeDeployerStack"
3. Click "Delete"

### Stop Services

```bash
docker compose down

# Or
make down
```

## Cost Estimate

**Free Tier Eligible:**
- CloudFront: 1 TB data transfer/month
- Lambda: 1M requests/month
- DynamoDB: 25 GB storage + 25 read/write units
- S3: 5 GB storage
- Bedrock: Pay per request (~$0.003 per request)

**Expected cost for testing:**
- Dev environment: $1-5/month
- Prod environment: $5-20/month (depends on traffic)
- Bedrock: $0.01-0.10 per app generation

**Tip:** Destroy dev environments when not in use to minimize costs.

## Next Steps

1. **Explore the generated code**:
   ```bash
   ls work/<app-id>/
   ```

2. **Read the generated README**:
   ```bash
   cat work/<app-id>/README.md
   ```

3. **Modify and redeploy**:
   ```bash
   cd work/<app-id>/infra
   npm install
   npx cdk deploy <AppName>-Dev
   ```

4. **Read the full documentation**: [README.md](README.md)

---

**Need help?** Open an issue on GitHub!

**Happy vibe coding!** 🚀
