import * as path from 'path';
import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { Environment, DeploymentResult, StackOutputs } from '@aws-vibe/shared';
import { assumeRole, createAssumedClients, getStackOutputs } from './util/aws';
import { execCdk, execCommand } from './util/exec';
import { readJson, writeJson, exists } from './util/fsx';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const WORK_DIR = '/work';

/**
 * Check if npm install is needed by comparing package.json hash
 */
async function needsNpmInstall(projectPath: string): Promise<boolean> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  const nodeModulesPath = path.join(projectPath, 'node_modules');
  const hashFile = path.join(projectPath, '.package-hash');

  // If node_modules doesn't exist, we need to install
  if (!(await exists(nodeModulesPath))) {
    return true;
  }

  // If package.json doesn't exist, skip (shouldn't happen)
  if (!(await exists(packageJsonPath))) {
    return false;
  }

  // Calculate current package.json hash
  const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
  const currentHash = crypto.createHash('md5').update(packageContent).digest('hex');

  // Read previous hash if it exists
  if (await exists(hashFile)) {
    const previousHash = await fs.readFile(hashFile, 'utf-8');
    if (previousHash.trim() === currentHash) {
      console.log(`[Deploy] package.json unchanged, skipping npm install in ${projectPath}`);
      return false;
    }
  }

  // Save new hash for next time
  await fs.writeFile(hashFile, currentHash);
  return true;
}

/**
 * Deploy CDK stack
 */
export async function deployCdkStack(
  appId: string,
  appName: string,
  accountId: string,
  region: string,
  environment: Environment,
  externalId: string,
  onStatus?: (step: string, message: string) => void
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

    // Install dependencies in parallel (only if package.json changed)
    if (onStatus) onStatus('deploy-install', 'Checking dependencies');
    const webPath = path.join(repoPath, 'web');

    const [needsInfraInstall, needsWebInstall] = await Promise.all([
      needsNpmInstall(infraPath),
      needsNpmInstall(webPath)
    ]);

    if (needsInfraInstall || needsWebInstall) {
      console.log(`[Deploy] Installing dependencies (infra: ${needsInfraInstall}, web: ${needsWebInstall})`);
      if (onStatus) onStatus('deploy-install', 'Installing dependencies');

      const installPromises = [];

      if (needsInfraInstall) {
        installPromises.push(
          execCommand('npm', ['install'], {
            cwd: infraPath,
            env: cdkEnv,
            timeout: 300000 // 5 minutes
          })
        );
      } else {
        installPromises.push(Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }));
      }

      if (needsWebInstall) {
        installPromises.push(
          execCommand('npm', ['install'], {
            cwd: webPath,
            timeout: 300000 // 5 minutes
          })
        );
      } else {
        installPromises.push(Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }));
      }

      const [installResult, webInstallResult] = await Promise.all(installPromises);

      if (installResult.exitCode !== 0) {
        throw new Error(`Infra npm install failed: ${installResult.stderr}`);
      }

      if (webInstallResult.exitCode !== 0) {
        throw new Error(`Web npm install failed: ${webInstallResult.stderr}`);
      }

      console.log(`[Deploy] Dependencies ready`);
    } else {
      console.log(`[Deploy] Dependencies unchanged, using cached node_modules`);
    }

    // Bootstrap CDK first (required before synth)
    if (onStatus) onStatus('deploy-bootstrap', 'Bootstrapping AWS CDK (first time only)');
    await bootstrapCdk(infraPath, cdkEnv);

    // Run web build and CDK synth in parallel (independent operations)
    if (onStatus) onStatus('deploy-build', 'Building web app and synthesizing CDK');
    console.log(`[Deploy] Running web build and CDK synth in parallel`);

    const [buildResult, synthResult] = await Promise.all([
      execCommand('npm', ['run', 'build'], {
        cwd: webPath,
        env: {
          NODE_ENV: 'production',
          // No NEXT_PUBLIC_API_URL - will be loaded from config.json at runtime
        },
        timeout: 300000 // 5 minutes
      }),
      execCdk(['synth', stackName], { cwd: infraPath, env: cdkEnv })
    ]);

    if (buildResult.exitCode !== 0) {
      throw new Error(`Web build failed: ${buildResult.stderr}`);
    }

    if (synthResult.exitCode !== 0) {
      throw new Error(`CDK synth failed: ${synthResult.stderr}`);
    }

    console.log(`[Deploy] Build and synth completed`);

    // Deploy infrastructure
    if (onStatus) onStatus('deploy-cdk', 'Deploying infrastructure with CloudFormation');
    console.log(`[Deploy] Deploying CDK stack: ${stackName}`);
    const deployResult = await execCdk(
      ['deploy', stackName, '--require-approval', 'never', '--outputs-file', 'outputs.json'],
      { cwd: infraPath, env: cdkEnv, timeout: 900000 } // 15 minutes
    );

    if (deployResult.exitCode !== 0) {
      throw new Error(`CDK deploy failed: ${deployResult.stderr}`);
    }

    // Read outputs to get API URL
    const outputsFile = path.join(infraPath, 'outputs.json');
    const outputsData = await readJson(outputsFile);
    const outputs: StackOutputs = outputsData[stackName] || {};
    const apiUrl = outputs.ApiUrl || outputs.ApiEndpoint4F160690;

    // Upload runtime config.json to S3 with API URL
    if (onStatus) onStatus('deploy-config', 'Uploading runtime configuration');
    console.log(`[Deploy] Uploading config.json with API URL: ${apiUrl}`);

    const bucketName = outputs.WebBucketName;
    if (bucketName) {
      const s3Client = new S3Client({
        region: region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        },
      });

      const configContent = JSON.stringify({
        apiUrl: apiUrl,
        environment: environment,
      });

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: 'config.json',
        Body: configContent,
        ContentType: 'application/json',
        CacheControl: 'no-cache', // Don't cache config
      }));

      console.log(`[Deploy] Config uploaded to s3://${bucketName}/config.json`);
    }

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
