import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, waitUntilStackCreateComplete } from '@aws-sdk/client-cloudformation';
import { assumeRole } from './util/aws';
import { writeJson, readJson, exists } from './util/fsx';
import { ConnectionConfig } from '@aws-vibe/shared';

const DATA_DIR = '/data';
const TENANT_FILE = path.join(DATA_DIR, 'tenant.json');
const CONNECT_TEMPLATE_PATH = path.join(
  __dirname,
  'cloudformation',
  'connect-min.json'
);

/**
 * Get or create tenant configuration
 */
export async function getTenantConfig(): Promise<{
  tenantId: string;
  externalId: string;
}> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    if (await exists(TENANT_FILE)) {
      const data = await readJson(TENANT_FILE);
      return data;
    }

    // Generate new tenant ID and external ID
    const tenantId = uuidv4();
    const externalId = uuidv4();

    const config = { tenantId, externalId };
    await writeJson(TENANT_FILE, config);

    console.log(`[Tenant] Created new tenant: ${tenantId}`);
    return config;
  } catch (error: any) {
    console.error(`[Tenant] Failed to get/create tenant config: ${error.message}`);
    throw error;
  }
}

/**
 * Build CloudFormation Quick-Create URL
 */
export async function buildQuickCreateUrl(region: string): Promise<string> {
  const { externalId } = await getTenantConfig();
  const controlPlaneAccountId = process.env.CONTROL_PLANE_ACCOUNT_ID!;
  const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';

  // Read CloudFormation template
  const templateContent = await fs.readFile(CONNECT_TEMPLATE_PATH, 'utf-8');
  const template = JSON.parse(templateContent);

  // Build the Quick-Create URL
  const stackName = 'VibeDeployerStack';
  const baseUrl = `https://${region}.console.aws.amazon.com/cloudformation/home`;

  const params = [
    {
      ParameterKey: 'ControlPlaneAccountId',
      ParameterValue: controlPlaneAccountId,
    },
    {
      ParameterKey: 'ExternalId',
      ParameterValue: externalId,
    },
    {
      ParameterKey: 'RoleName',
      ParameterValue: roleName,
    },
  ];

  const queryParams = new URLSearchParams();
  queryParams.set('region', region);
  queryParams.set('stackName', stackName);
  queryParams.set('templateBody', JSON.stringify(template));
  queryParams.set('param_0', JSON.stringify(params));

  const url = `${baseUrl}#/stacks/quickcreate?${queryParams.toString()}`;

  console.log(`[Connect] Generated Quick-Create URL for region: ${region}`);
  return url;
}

/**
 * Verify connection by attempting to assume role
 */
export async function verifyConnection(
  accountId: string,
  region: string
): Promise<{ ok: boolean; roleArn?: string; error?: string }> {
  const { externalId } = await getTenantConfig();
  const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

  try {
    console.log(`[Connect] Verifying connection to ${accountId} in ${region}`);

    const credentials = await assumeRole({
      accountId,
      region,
      roleName,
      externalId,
      sessionName: 'vibe-verification',
    });

    console.log(`[Connect] Successfully verified connection to ${roleArn}`);

    // Save connection config
    const connectionConfig: ConnectionConfig = {
      tenantId: (await getTenantConfig()).tenantId,
      accountId,
      region,
      roleArn,
      externalId,
      verifiedAt: new Date().toISOString(),
    };

    const connectionFile = path.join(DATA_DIR, `connection-${accountId}.json`);
    await writeJson(connectionFile, connectionConfig);

    return { ok: true, roleArn };
  } catch (error: any) {
    console.error(`[Connect] Verification failed: ${error.message}`);
    return {
      ok: false,
      error: error.message || 'Failed to assume role. Ensure the CloudFormation stack was created successfully.',
    };
  }
}

/**
 * Get connection config for an account
 */
export async function getConnectionConfig(
  accountId: string
): Promise<ConnectionConfig | null> {
  const connectionFile = path.join(DATA_DIR, `connection-${accountId}.json`);

  if (await exists(connectionFile)) {
    return await readJson<ConnectionConfig>(connectionFile);
  }

  return null;
}

/**
 * Auto-create CloudFormation stack if it doesn't exist
 */
export async function ensureStackExists(): Promise<{
  success: boolean;
  message: string;
  roleArn?: string;
}> {
  const accountId = process.env.CONTROL_PLANE_ACCOUNT_ID!;
  const region = process.env.DEFAULT_REGION || 'us-east-1';
  const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';
  const stackName = 'VibeDeployerStack';

  console.log(`[Connect] Checking if stack ${stackName} exists...`);

  const cfnClient = new CloudFormationClient({ region });

  try {
    // Check if stack already exists
    try {
      const describeCommand = new DescribeStacksCommand({ StackName: stackName });
      const response = await cfnClient.send(describeCommand);
      const stack = response.Stacks?.[0];

      if (stack && (stack.StackStatus === 'CREATE_COMPLETE' || stack.StackStatus === 'UPDATE_COMPLETE')) {
        console.log(`[Connect] Stack already exists with status: ${stack.StackStatus}`);

        // Verify connection
        const verification = await verifyConnection(accountId, region);

        if (verification.ok) {
          return {
            success: true,
            message: 'Stack exists and connection verified',
            roleArn: verification.roleArn,
          };
        } else {
          return {
            success: false,
            message: `Stack exists but connection failed: ${verification.error}`,
          };
        }
      }
    } catch (error: any) {
      if (error.name !== 'ValidationError') {
        throw error;
      }
      // Stack doesn't exist, create it
      console.log(`[Connect] Stack does not exist, creating...`);
    }

    // Get tenant config (creates if doesn't exist)
    const { externalId } = await getTenantConfig();

    // Read CloudFormation template
    const templateContent = await fs.readFile(CONNECT_TEMPLATE_PATH, 'utf-8');

    // Create stack
    const createCommand = new CreateStackCommand({
      StackName: stackName,
      TemplateBody: templateContent,
      Parameters: [
        {
          ParameterKey: 'ControlPlaneAccountId',
          ParameterValue: accountId,
        },
        {
          ParameterKey: 'ExternalId',
          ParameterValue: externalId,
        },
        {
          ParameterKey: 'RoleName',
          ParameterValue: roleName,
        },
      ],
      Capabilities: ['CAPABILITY_NAMED_IAM'],
    });

    console.log(`[Connect] Creating CloudFormation stack...`);
    await cfnClient.send(createCommand);

    // Wait for stack creation to complete
    console.log(`[Connect] Waiting for stack creation to complete...`);
    await waitUntilStackCreateComplete(
      { client: cfnClient, maxWaitTime: 300 }, // 5 minutes max
      { StackName: stackName }
    );

    console.log(`[Connect] Stack created successfully!`);

    // Verify connection
    const verification = await verifyConnection(accountId, region);

    if (verification.ok) {
      return {
        success: true,
        message: 'Stack created and connection verified',
        roleArn: verification.roleArn,
      };
    } else {
      return {
        success: false,
        message: `Stack created but connection failed: ${verification.error}`,
      };
    }
  } catch (error: any) {
    console.error(`[Connect] Failed to ensure stack exists: ${error.message}`);
    return {
      success: false,
      message: `Failed to create stack: ${error.message}`,
    };
  }
}
