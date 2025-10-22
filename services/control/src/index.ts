import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// Load environment variables
dotenv.config();

import {
  InitResponse,
  ConnectUrlResponse,
  CheckConnectionResponse,
  GenerateResponse,
  PublishResponse,
  DestroyResponse,
  AppListItem,
  Environment,
  AppManifest,
  Blueprint,
} from '@aws-vibe/shared';

import { getTenantConfig, buildQuickCreateUrl, verifyConnection, ensureStackExists } from './connect';
import { assumeRole } from './util/aws';
import { generateAppSpec } from './scaffold/generateSpec';
import { renderRepo } from './scaffold/renderRepo';
import { deployCdkStack, destroyCdkStack } from './deploy';
import { validateRequest, generateRequestSchema, publishRequestSchema, destroyRequestSchema, checkConnectionRequestSchema } from './util/validation';
import { readJson, writeJson, listDir, exists } from './util/fsx';

const app = express();
const port = process.env.PORT || 4000;

const WORK_DIR = '/work';

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * Initialize - get tenant config and connection status
 */
app.get('/api/init', async (req, res) => {
  try {
    const { tenantId } = await getTenantConfig();
    const controlPlaneAccountId = process.env.CONTROL_PLANE_ACCOUNT_ID!;
    const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';
    const defaultRegion = process.env.DEFAULT_REGION || 'us-east-1';

    // Check connection status
    const connectionResult = await verifyConnection(controlPlaneAccountId, defaultRegion);

    const response: InitResponse = {
      tenantId,
      defaultRegion,
      roleName,
      controlPlaneAccountId,
      connected: connectionResult.ok,
      roleArn: connectionResult.roleArn,
    };

    res.json(response);
  } catch (error: any) {
    console.error('[API] Init error:', error);
    res.status(500).json({ error: 'Failed to initialize', message: error.message });
  }
});

/**
 * Get Quick-Create CloudFormation URL
 */
app.get('/api/connect-url', async (req, res) => {
  try {
    const region = (req.query.region as string) || process.env.DEFAULT_REGION || 'us-east-1';
    const url = await buildQuickCreateUrl(region);

    const response: ConnectUrlResponse = { url };
    res.json(response);
  } catch (error: any) {
    console.error('[API] Connect URL error:', error);
    res.status(500).json({ error: 'Failed to generate URL', message: error.message });
  }
});

/**
 * Check connection by attempting AssumeRole
 */
app.post('/api/check', async (req, res) => {
  try {
    const data = validateRequest(checkConnectionRequestSchema, req.body);
    const region = data.region || process.env.DEFAULT_REGION || 'us-east-1';

    const result = await verifyConnection(data.accountId, region);

    const response: CheckConnectionResponse = result;
    res.json(response);
  } catch (error: any) {
    console.error('[API] Check connection error:', error);
    res.status(400).json({ error: 'Validation failed', message: error.message });
  }
});

/**
 * Generate app spec and deploy dev stack
 */
app.post('/api/generate', async (req, res) => {
  try {
    const data = validateRequest(generateRequestSchema, req.body);
    const { accountId, region, blueprint, prompt, appName } = data;

    // Sanitize app name for CloudFormation (no spaces, special chars)
    const sanitizedAppName = appName
      .replace(/[^a-zA-Z0-9-]/g, '-')  // Replace invalid chars with hyphen
      .replace(/-+/g, '-')              // Remove consecutive hyphens
      .replace(/^-|-$/g, '');           // Remove leading/trailing hyphens

    // Get tenant config for external ID
    const { externalId } = await getTenantConfig();
    const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';

    // Assume role
    const credentials = await assumeRole({
      accountId,
      region,
      roleName,
      externalId,
      sessionName: `vibe-generate-${Date.now()}`,
    });

    // Generate app spec using Bedrock
    console.log(`[API] Generating spec for: ${appName}`);
    const spec = await generateAppSpec(prompt, blueprint, credentials);

    // Generate app ID
    const appId = uuidv4();

    // Render repository with sanitized app name
    console.log(`[API] Rendering repository for: ${appName}`);
    await renderRepo(appId, spec, accountId, region, sanitizedAppName);

    // Deploy dev stack
    console.log(`[API] Deploying dev stack for: ${sanitizedAppName}`);
    const deployment = await deployCdkStack(
      appId,
      sanitizedAppName,
      accountId,
      region,
      Environment.DEV,
      externalId
    );

    if (deployment.status === 'failed') {
      throw new Error(deployment.error || 'Deployment failed');
    }

    // Update manifest
    const manifestPath = path.join(WORK_DIR, appId, '.vibe', 'manifest.json');
    const manifest: AppManifest = await readJson(manifestPath);
    manifest.deployments.dev = deployment;
    manifest.updatedAt = new Date().toISOString();
    await writeJson(manifestPath, manifest);

    const response: GenerateResponse = {
      appId,
      spec,
      previewUrl: deployment.previewUrl || '',
      stackName: deployment.stackName,
      outputs: deployment.outputs,
    };

    res.json(response);
  } catch (error: any) {
    console.error('[API] Generate error:', error);
    res.status(500).json({
      error: 'Generation failed',
      message: error.message,
      details: error.name === 'BedrockAccessError' ? {
        type: 'bedrock_access',
        region: process.env.BEDROCK_REGION,
        modelId: process.env.BEDROCK_MODEL_ID,
      } : undefined,
    });
  }
});

/**
 * Publish to production
 */
app.post('/api/publish', async (req, res) => {
  try {
    const data = validateRequest(publishRequestSchema, req.body);
    const { accountId, region, appId } = data;

    // Read manifest
    const manifestPath = path.join(WORK_DIR, appId, '.vibe', 'manifest.json');
    if (!(await exists(manifestPath))) {
      throw new Error('App not found');
    }

    const manifest: AppManifest = await readJson(manifestPath);

    // Sanitize app name for CloudFormation
    const sanitizedAppName = manifest.appName
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Get tenant config
    const { externalId } = await getTenantConfig();

    // Deploy prod stack
    console.log(`[API] Deploying prod stack for: ${manifest.appName}`);
    const deployment = await deployCdkStack(
      appId,
      sanitizedAppName,
      accountId,
      region,
      Environment.PROD,
      externalId
    );

    if (deployment.status === 'failed') {
      throw new Error(deployment.error || 'Deployment failed');
    }

    // Update manifest
    manifest.deployments.prod = deployment;
    manifest.updatedAt = new Date().toISOString();
    await writeJson(manifestPath, manifest);

    const response: PublishResponse = {
      prodUrl: deployment.prodUrl || '',
      stackName: deployment.stackName,
      outputs: deployment.outputs,
    };

    res.json(response);
  } catch (error: any) {
    console.error('[API] Publish error:', error);
    res.status(500).json({ error: 'Publish failed', message: error.message });
  }
});

/**
 * List apps
 */
app.get('/api/apps', async (req, res) => {
  try {
    const apps: AppListItem[] = [];

    if (await exists(WORK_DIR)) {
      const dirs = await listDir(WORK_DIR);

      for (const dir of dirs) {
        const manifestPath = path.join(WORK_DIR, dir, '.vibe', 'manifest.json');
        if (await exists(manifestPath)) {
          const manifest: AppManifest = await readJson(manifestPath);

          apps.push({
            appId: manifest.appId,
            appName: manifest.appName,
            blueprint: manifest.blueprint,
            devUrl: manifest.deployments.dev?.previewUrl,
            prodUrl: manifest.deployments.prod?.prodUrl,
            createdAt: manifest.createdAt,
          });
        }
      }
    }

    res.json(apps);
  } catch (error: any) {
    console.error('[API] List apps error:', error);
    res.status(500).json({ error: 'Failed to list apps', message: error.message });
  }
});

/**
 * Destroy stack
 */
app.post('/api/destroy', async (req, res) => {
  try {
    const data = validateRequest(destroyRequestSchema, req.body);
    const { accountId, region, appId, env } = data;

    // Read manifest
    const manifestPath = path.join(WORK_DIR, appId, '.vibe', 'manifest.json');
    if (!(await exists(manifestPath))) {
      throw new Error('App not found');
    }

    const manifest: AppManifest = await readJson(manifestPath);

    // Sanitize app name for CloudFormation
    const sanitizedAppName = manifest.appName
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Get tenant config
    const { externalId } = await getTenantConfig();

    // Destroy stack
    console.log(`[API] Destroying ${env} stack for: ${manifest.appName}`);
    await destroyCdkStack(
      appId,
      sanitizedAppName,
      accountId,
      region,
      env,
      externalId
    );

    // Update manifest
    if (env === Environment.DEV) {
      delete manifest.deployments.dev;
    } else {
      delete manifest.deployments.prod;
    }
    manifest.updatedAt = new Date().toISOString();
    await writeJson(manifestPath, manifest);

    const response: DestroyResponse = {
      ok: true,
      message: `${env} stack destroyed successfully`,
    };

    res.json(response);
  } catch (error: any) {
    console.error('[API] Destroy error:', error);
    res.status(500).json({ error: 'Destroy failed', message: error.message });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize and start server
async function initializeApp() {
  console.log('[API] Initializing AWS connection...');

  const result = await ensureStackExists();

  if (result.success) {
    console.log(`[API] ✓ Connected to AWS: ${result.roleArn}`);
  } else {
    console.error(`[API] ✗ Connection failed: ${result.message}`);
    console.error('[API] The application will start, but AWS operations may fail.');
  }

  // Start server
  app.listen(port, () => {
    console.log(`[API] Control service listening on port ${port}`);
    console.log(`[API] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[API] Control Plane Account: ${process.env.CONTROL_PLANE_ACCOUNT_ID}`);
    console.log(`[API] Bedrock Region: ${process.env.BEDROCK_REGION}`);
    console.log(`[API] Bedrock Model: ${process.env.BEDROCK_MODEL_ID}`);
  });
}

initializeApp();
