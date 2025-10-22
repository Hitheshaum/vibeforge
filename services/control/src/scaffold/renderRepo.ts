import * as path from 'path';
import * as ejs from 'ejs';
import { AppSpec, AppManifest, Blueprint, Environment } from '@aws-vibe/shared';
import { ensureDir, writeFile, writeJson, initGitRepo } from '../util/fsx';

const WORK_DIR = '/work';

/**
 * Render application repository from spec
 */
export async function renderRepo(
  appId: string,
  spec: AppSpec,
  accountId: string,
  region: string,
  sanitizedAppName?: string
): Promise<string> {
  const repoPath = path.join(WORK_DIR, appId);
  console.log(`[Scaffold] Rendering repo at: ${repoPath}`);

  // Sanitize app name for CloudFormation if not provided
  const safeName = sanitizedAppName || spec.name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Ensure clean directory
  await ensureDir(repoPath);

  // Create directory structure
  await createDirectoryStructure(repoPath, spec.blueprint);

  // Render based on blueprint
  if (spec.blueprint === Blueprint.SERVERLESS) {
    await renderServerlessBlueprint(repoPath, appId, spec, accountId, region, safeName);
  } else if (spec.blueprint === Blueprint.CONTAINERS) {
    await renderContainersBlueprint(repoPath, appId, spec, accountId, region, safeName);
  }

  // Create manifest
  await createManifest(repoPath, appId, spec, accountId, region);

  // Initialize git
  await initGitRepo(repoPath, spec.name);

  console.log(`[Scaffold] Repo rendered successfully at: ${repoPath}`);
  return repoPath;
}

/**
 * Create directory structure
 */
async function createDirectoryStructure(
  repoPath: string,
  blueprint: Blueprint
): Promise<void> {
  const dirs = [
    '.vibe',
    'infra',
    'infra/bin',
    'infra/lib',
    'web',
    'web/src',
    'web/src/pages',
    'web/src/components',
    'web/src/lib',
    'web/public',
    'api',
    'api/src',
    'api/src/handlers',
    'tests',
  ];

  if (blueprint === Blueprint.CONTAINERS) {
    dirs.push('api/docker');
  }

  for (const dir of dirs) {
    await ensureDir(path.join(repoPath, dir));
  }
}

/**
 * Render serverless blueprint
 */
async function renderServerlessBlueprint(
  repoPath: string,
  appId: string,
  spec: AppSpec,
  accountId: string,
  region: string,
  sanitizedAppName: string
): Promise<void> {
  const templateDir = path.join(__dirname, 'blueprints', 'serverless');

  const context = {
    appId,
    appName: sanitizedAppName,  // Use sanitized name for CloudFormation
    displayName: spec.name,      // Keep original for display
    accountId,
    region,
    spec,
    auth: spec.auth,
  };

  // Infrastructure
  await renderTemplate(
    path.join(templateDir, 'infra-package.json.ejs'),
    path.join(repoPath, 'infra', 'package.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-tsconfig.json.ejs'),
    path.join(repoPath, 'infra', 'tsconfig.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-cdk.json.ejs'),
    path.join(repoPath, 'infra', 'cdk.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-bin.ts.ejs'),
    path.join(repoPath, 'infra', 'bin', 'infra.ts'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-stack.ts.ejs'),
    path.join(repoPath, 'infra', 'lib', 'app-stack.ts'),
    context
  );

  // Web
  await renderTemplate(
    path.join(templateDir, 'web-package.json.ejs'),
    path.join(repoPath, 'web', 'package.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'web-next.config.js.ejs'),
    path.join(repoPath, 'web', 'next.config.js'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'web-tsconfig.json.ejs'),
    path.join(repoPath, 'web', 'tsconfig.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'web-app.tsx.ejs'),
    path.join(repoPath, 'web', 'src', 'pages', '_app.tsx'),
    context
  );

  // Write generated code if available, otherwise use template
  if (spec.generatedCode) {
    console.log(`[Scaffold] Writing Bedrock-generated code to files`);

    // Write generated pages
    for (const [route, code] of Object.entries(spec.generatedCode.pages)) {
      const fileName = route === '/' ? 'index.tsx' : `${route.replace(/^\//, '')}.tsx`;
      await writeFile(path.join(repoPath, 'web', 'src', 'pages', fileName), code);
      console.log(`[Scaffold] Wrote page: ${fileName}`);
    }

    // Write generated components
    for (const [componentName, code] of Object.entries(spec.generatedCode.components)) {
      await writeFile(
        path.join(repoPath, 'web', 'src', 'components', `${componentName}.tsx`),
        code
      );
      console.log(`[Scaffold] Wrote component: ${componentName}.tsx`);
    }

    // Write generated lib files
    for (const [libName, code] of Object.entries(spec.generatedCode.lib)) {
      const fileName = libName.endsWith('.ts') ? libName : `${libName}.ts`;
      await writeFile(path.join(repoPath, 'web', 'src', 'lib', fileName), code);
      console.log(`[Scaffold] Wrote lib: ${fileName}`);
    }
  } else {
    // Fallback to template-based rendering
    await renderTemplate(
      path.join(templateDir, 'web-index.tsx.ejs'),
      path.join(repoPath, 'web', 'src', 'pages', 'index.tsx'),
      context
    );
  }

  // API handlers
  for (const endpoint of spec.api) {
    await renderTemplate(
      path.join(templateDir, 'api-handler.ts.ejs'),
      path.join(repoPath, 'api', 'src', 'handlers', `${endpoint.handler}.ts`),
      { endpoint, spec }
    );
  }

  await renderTemplate(
    path.join(templateDir, 'api-package.json.ejs'),
    path.join(repoPath, 'api', 'package.json'),
    context
  );

  // Root files
  await renderTemplate(
    path.join(templateDir, 'gitignore.ejs'),
    path.join(repoPath, '.gitignore'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'README.md.ejs'),
    path.join(repoPath, 'README.md'),
    context
  );
}

/**
 * Render containers blueprint
 */
async function renderContainersBlueprint(
  repoPath: string,
  appId: string,
  spec: AppSpec,
  accountId: string,
  region: string,
  sanitizedAppName: string
): Promise<void> {
  const templateDir = path.join(__dirname, 'blueprints', 'containers');

  const context = {
    appId,
    appName: sanitizedAppName,  // Use sanitized name for CloudFormation
    displayName: spec.name,      // Keep original for display
    accountId,
    region,
    spec,
    auth: spec.auth,
  };

  // Infrastructure
  await renderTemplate(
    path.join(templateDir, 'infra-package.json.ejs'),
    path.join(repoPath, 'infra', 'package.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-cdk.json.ejs'),
    path.join(repoPath, 'infra', 'cdk.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-bin.ts.ejs'),
    path.join(repoPath, 'infra', 'bin', 'infra.ts'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'infra-stack.ts.ejs'),
    path.join(repoPath, 'infra', 'lib', 'app-stack.ts'),
    context
  );

  // Web (same as serverless)
  const serverlessTemplateDir = path.join(__dirname, 'blueprints', 'serverless');
  await renderTemplate(
    path.join(serverlessTemplateDir, 'web-package.json.ejs'),
    path.join(repoPath, 'web', 'package.json'),
    context
  );

  await renderTemplate(
    path.join(serverlessTemplateDir, 'web-next.config.js.ejs'),
    path.join(repoPath, 'web', 'next.config.js'),
    context
  );

  await renderTemplate(
    path.join(serverlessTemplateDir, 'web-tsconfig.json.ejs'),
    path.join(repoPath, 'web', 'tsconfig.json'),
    context
  );

  await renderTemplate(
    path.join(serverlessTemplateDir, 'web-app.tsx.ejs'),
    path.join(repoPath, 'web', 'src', 'pages', '_app.tsx'),
    context
  );

  // Write generated code if available, otherwise use template
  if (spec.generatedCode) {
    console.log(`[Scaffold] Writing Bedrock-generated code to files`);

    // Write generated pages
    for (const [route, code] of Object.entries(spec.generatedCode.pages)) {
      const fileName = route === '/' ? 'index.tsx' : `${route.replace(/^\//, '')}.tsx`;
      await writeFile(path.join(repoPath, 'web', 'src', 'pages', fileName), code);
      console.log(`[Scaffold] Wrote page: ${fileName}`);
    }

    // Write generated components
    for (const [componentName, code] of Object.entries(spec.generatedCode.components)) {
      await writeFile(
        path.join(repoPath, 'web', 'src', 'components', `${componentName}.tsx`),
        code
      );
      console.log(`[Scaffold] Wrote component: ${componentName}.tsx`);
    }

    // Write generated lib files
    for (const [libName, code] of Object.entries(spec.generatedCode.lib)) {
      const fileName = libName.endsWith('.ts') ? libName : `${libName}.ts`;
      await writeFile(path.join(repoPath, 'web', 'src', 'lib', fileName), code);
      console.log(`[Scaffold] Wrote lib: ${fileName}`);
    }
  } else {
    // Fallback to template-based rendering
    await renderTemplate(
      path.join(serverlessTemplateDir, 'web-index.tsx.ejs'),
      path.join(repoPath, 'web', 'src', 'pages', 'index.tsx'),
      context
    );
  }

  // API with Dockerfile
  await renderTemplate(
    path.join(templateDir, 'api-package.json.ejs'),
    path.join(repoPath, 'api', 'package.json'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'api-server.ts.ejs'),
    path.join(repoPath, 'api', 'src', 'server.ts'),
    context
  );

  await renderTemplate(
    path.join(templateDir, 'api-Dockerfile.ejs'),
    path.join(repoPath, 'api', 'Dockerfile'),
    context
  );

  // Root files
  await renderTemplate(
    path.join(templateDir, 'README.md.ejs'),
    path.join(repoPath, 'README.md'),
    context
  );
}

/**
 * Create manifest file
 */
async function createManifest(
  repoPath: string,
  appId: string,
  spec: AppSpec,
  accountId: string,
  region: string
): Promise<void> {
  const manifest: AppManifest = {
    appId,
    appName: spec.name,
    blueprint: spec.blueprint,
    spec,
    accountId,
    region,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deployments: {},
  };

  await writeJson(path.join(repoPath, '.vibe', 'manifest.json'), manifest);
}

/**
 * Render EJS template to file
 */
async function renderTemplate(
  templatePath: string,
  outputPath: string,
  context: any
): Promise<void> {
  try {
    const rendered = await ejs.renderFile(templatePath, context, {
      async: true,
    });
    await writeFile(outputPath, rendered);
  } catch (error: any) {
    console.error(`[Scaffold] Failed to render template ${templatePath}: ${error.message}`);
    throw error;
  }
}
