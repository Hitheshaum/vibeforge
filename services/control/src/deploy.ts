import * as path from 'path';
import { Environment, DeploymentResult, StackOutputs } from '@aws-vibe/shared';
import { assumeRole, createAssumedClients, getStackOutputs } from './util/aws';
import { execCdk, execCommand } from './util/exec';
import { readJson, writeJson } from './util/fsx';

const WORK_DIR = '/work';

/**
 * Deploy CDK stack
 */
export async function deployCdkStack(
  appId: string,
  appName: string,
  accountId: string,
  region: string,
  environment: Environment,
  externalId: string
): Promise<DeploymentResult> {
  const repoPath = path.join(WORK_DIR, appId);
  const infraPath = path.join(repoPath, 'infra');
  const stackName = `${appName}-${environment === Environment.DEV ? 'Dev' : 'Prod'}`;

  console.log(`[Deploy] Deploying stack: ${stackName}`);

  try {
    // Assume role
    const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';
    const credentials = await assumeRole({
      accountId,
      region,
      roleName,
      externalId,
      sessionName: `vibe-deploy-${appId}`,
    });

    // Create AWS clients
    const clients = createAssumedClients(credentials, region);

    // Set environment variables for CDK
    const cdkEnv = {
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken,
      AWS_REGION: region,
      AWS_DEFAULT_REGION: region,
      CDK_DEFAULT_ACCOUNT: accountId,
      CDK_DEFAULT_REGION: region,
    };

    // Install dependencies FIRST (required for bootstrap)
    console.log(`[Deploy] Installing dependencies in ${infraPath}`);
    const installResult = await execCommand('npm', ['install'], {
      cwd: infraPath,
      env: cdkEnv,
      timeout: 300000 // 5 minutes
    });

    if (installResult.exitCode !== 0) {
      throw new Error(`npm install failed: ${installResult.stderr}`);
    }

    // Install and build web app
    const webPath = path.join(repoPath, 'web');
    console.log(`[Deploy] Installing web dependencies in ${webPath}`);
    const webInstallResult = await execCommand('npm', ['install'], {
      cwd: webPath,
      timeout: 300000 // 5 minutes
    });

    if (webInstallResult.exitCode !== 0) {
      throw new Error(`Web npm install failed: ${webInstallResult.stderr}`);
    }

    console.log(`[Deploy] Building web app in ${webPath}`);
    const webBuildResult = await execCommand('npm', ['run', 'build'], {
      cwd: webPath,
      env: { NODE_ENV: 'production' },
      timeout: 300000 // 5 minutes
    });

    if (webBuildResult.exitCode !== 0) {
      throw new Error(`Web build failed: ${webBuildResult.stderr}`);
    }

    // Bootstrap CDK (after dependencies are installed)
    await bootstrapCdk(infraPath, cdkEnv);

    // Synth
    console.log(`[Deploy] Synthesizing CDK stack`);
    await execCdk(['synth', stackName], { cwd: infraPath, env: cdkEnv });

    // Deploy
    console.log(`[Deploy] Deploying CDK stack: ${stackName}`);
    const deployResult = await execCdk(
      ['deploy', stackName, '--require-approval', 'never', '--outputs-file', 'outputs.json'],
      { cwd: infraPath, env: cdkEnv, timeout: 900000 } // 15 minutes
    );

    if (deployResult.exitCode !== 0) {
      throw new Error(`CDK deploy failed: ${deployResult.stderr}`);
    }

    // Read outputs
    const outputsFile = path.join(infraPath, 'outputs.json');
    const outputsData = await readJson(outputsFile);
    const outputs: StackOutputs = outputsData[stackName] || {};

    // Get preview/prod URL
    const previewUrl = outputs.PreviewUrl;
    const prodUrl = outputs.ProdUrl;

    console.log(`[Deploy] Stack deployed successfully: ${stackName}`);
    console.log(`[Deploy] Preview URL: ${previewUrl || prodUrl || 'N/A'}`);

    return {
      stackName,
      environment,
      outputs,
      previewUrl,
      prodUrl,
      status: 'success',
    };
  } catch (error: any) {
    console.error(`[Deploy] Deployment failed: ${error.message}`);

    return {
      stackName,
      environment,
      outputs: {},
      status: 'failed',
      error: error.message,
    };
  }
}

/**
 * Bootstrap CDK in target account
 */
async function bootstrapCdk(
  infraPath: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  console.log(`[Deploy] Bootstrapping CDK`);

  try {
    const result = await execCdk(['bootstrap'], {
      cwd: infraPath,
      env,
      timeout: 300000, // 5 minutes
    });

    if (result.exitCode !== 0) {
      if (result.stderr.includes('already bootstrapped') || result.stdout.includes('already bootstrapped')) {
        console.log(`[Deploy] CDK already bootstrapped`);
        return;
      }
      console.error(`[Deploy] Bootstrap failed with exit code ${result.exitCode}`);
      console.error(`[Deploy] STDERR: ${result.stderr}`);
      console.error(`[Deploy] STDOUT: ${result.stdout}`);
      throw new Error(`CDK bootstrap failed: ${result.stderr || result.stdout}`);
    }

    console.log(`[Deploy] CDK bootstrap completed successfully`);
  } catch (error: any) {
    console.error(`[Deploy] Bootstrap error: ${error.message}`);
    throw error;
  }
}

/**
 * Destroy CDK stack
 */
export async function destroyCdkStack(
  appId: string,
  appName: string,
  accountId: string,
  region: string,
  environment: Environment,
  externalId: string
): Promise<void> {
  const repoPath = path.join(WORK_DIR, appId);
  const infraPath = path.join(repoPath, 'infra');
  const stackName = `${appName}-${environment === Environment.DEV ? 'Dev' : 'Prod'}`;

  console.log(`[Deploy] Destroying stack: ${stackName}`);

  // Assume role
  const roleName = process.env.ROLE_NAME || 'VibeDeployerRole';
  const credentials = await assumeRole({
    accountId,
    region,
    roleName,
    externalId,
    sessionName: `vibe-destroy-${appId}`,
  });

  // Set environment variables for CDK
  const cdkEnv = {
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
    AWS_REGION: region,
    AWS_DEFAULT_REGION: region,
    CDK_DEFAULT_ACCOUNT: accountId,
    CDK_DEFAULT_REGION: region,
  };

  // Destroy
  const result = await execCdk(['destroy', stackName, '--force'], {
    cwd: infraPath,
    env: cdkEnv,
    timeout: 600000, // 10 minutes
  });

  if (result.exitCode !== 0) {
    throw new Error(`CDK destroy failed: ${result.stderr}`);
  }

  console.log(`[Deploy] Stack destroyed: ${stackName}`);
}
