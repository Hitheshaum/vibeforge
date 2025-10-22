import {
  STSClient,
  AssumeRoleCommand,
  AssumeRoleCommandOutput,
} from '@aws-sdk/client-sts';
import {
  CloudFormationClient,
  DescribeStacksCommand,
  Stack,
} from '@aws-sdk/client-cloudformation';
import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { AssumeRoleError } from '@aws-vibe/shared';

/**
 * AWS client utilities with STS AssumeRole support
 */

export interface AssumedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
}

export interface AssumeRoleParams {
  accountId: string;
  region: string;
  roleName: string;
  externalId: string;
  sessionName?: string;
}

/**
 * Assume role in target account and return credentials
 */
export async function assumeRole(
  params: AssumeRoleParams
): Promise<AssumedCredentials> {
  const { accountId, region, roleName, externalId, sessionName } = params;
  const roleArn = `arn:aws:iam::${accountId}:role/${roleName}`;

  console.log(`[AWS] Assuming role: ${roleArn}`);

  const stsClient = new STSClient({ region });

  try {
    const command = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: sessionName || `vibe-session-${Date.now()}`,
      ExternalId: externalId,
      DurationSeconds: 3600, // 1 hour
    });

    const response: AssumeRoleCommandOutput = await stsClient.send(command);

    if (!response.Credentials) {
      throw new AssumeRoleError('No credentials returned from AssumeRole');
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId!,
      secretAccessKey: response.Credentials.SecretAccessKey!,
      sessionToken: response.Credentials.SessionToken!,
      expiration: response.Credentials.Expiration,
    };
  } catch (error: any) {
    console.error(`[AWS] AssumeRole failed: ${error.message}`);
    throw new AssumeRoleError(
      `Failed to assume role ${roleArn}: ${error.message}`
    );
  }
}

/**
 * Create AWS clients with assumed role credentials
 */
export function createAssumedClients(
  credentials: AssumedCredentials,
  region: string
) {
  const clientConfig = {
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  };

  return {
    cloudformation: new CloudFormationClient(clientConfig),
    iam: new IAMClient(clientConfig),
    s3: new S3Client(clientConfig),
    bedrock: new BedrockRuntimeClient(clientConfig),
  };
}

/**
 * Get CloudFormation stack outputs
 */
export async function getStackOutputs(
  cfnClient: CloudFormationClient,
  stackName: string
): Promise<Record<string, string>> {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await cfnClient.send(command);

    const stack = response.Stacks?.[0];
    if (!stack || !stack.Outputs) {
      return {};
    }

    const outputs: Record<string, string> = {};
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    }

    return outputs;
  } catch (error: any) {
    console.error(`[AWS] Failed to get stack outputs: ${error.message}`);
    return {};
  }
}

/**
 * Get CloudFormation stack status
 */
export async function getStackStatus(
  cfnClient: CloudFormationClient,
  stackName: string
): Promise<string | null> {
  try {
    const command = new DescribeStacksCommand({ StackName: stackName });
    const response = await cfnClient.send(command);
    return response.Stacks?.[0]?.StackStatus || null;
  } catch (error: any) {
    if (error.name === 'ValidationError') {
      return null; // Stack doesn't exist
    }
    throw error;
  }
}

/**
 * Check if stack exists
 */
export async function stackExists(
  cfnClient: CloudFormationClient,
  stackName: string
): Promise<boolean> {
  const status = await getStackStatus(cfnClient, stackName);
  return status !== null;
}

/**
 * Build resource tags
 */
export function buildTags(appId: string, env: string): Record<string, string> {
  return {
    AppId: appId,
    Env: env,
    ManagedBy: 'aws-vibe',
    CreatedAt: new Date().toISOString(),
  };
}

/**
 * Convert tags object to CloudFormation tag format
 */
export function tagsToArray(tags: Record<string, string>): Array<{ Key: string; Value: string }> {
  return Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
}

/**
 * Build Quick-Create CloudFormation URL
 */
export function buildQuickCreateUrl(
  region: string,
  templateBody: string,
  stackName: string,
  parameters: Record<string, string> = {}
): string {
  const baseUrl = `https://${region}.console.aws.amazon.com/cloudformation/home`;

  const paramArray = Object.entries(parameters).map(([key, value]) => ({
    ParameterKey: key,
    ParameterValue: value,
  }));

  const queryParams = new URLSearchParams({
    region,
    stackName,
    templateBody: templateBody,
  });

  if (paramArray.length > 0) {
    queryParams.set('param_0', JSON.stringify(paramArray));
  }

  return `${baseUrl}#/stacks/quickcreate?${queryParams.toString()}`;
}
