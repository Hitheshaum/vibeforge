import { spawn } from 'child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Execute a command and return the output
 */
export async function execCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
  } = {}
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log(output);
    });

    proc.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      console.error(output);
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    proc.on('error', (error) => {
      reject(error);
    });

    // Timeout handling
    if (options.timeout) {
      setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}

/**
 * Execute CDK command
 */
export async function execCdk(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
  } = {}
): Promise<ExecResult> {
  console.log(`[CDK] Executing: cdk ${args.join(' ')}`);
  return execCommand('npx', ['cdk', ...args], {
    ...options,
    timeout: options.timeout || 600000, // 10 minutes default
  });
}
