import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { AppSpec, BedrockAccessError, GeneratedCode } from '@aws-vibe/shared';
import { AssumedCredentials } from './util/aws';

const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Generate app specification using Amazon Bedrock
 */
export async function generateSpec(
  prompt: string,
  blueprint: string,
  credentials: AssumedCredentials
): Promise<AppSpec> {
  console.log(`[Bedrock] Generating spec for blueprint: ${blueprint}`);

  const client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const systemPrompt = buildSystemPrompt(blueprint);
  const userPrompt = buildUserPrompt(prompt, blueprint);

  try {
    // Detect model type and format request accordingly
    const isClaudeModel = BEDROCK_MODEL_ID.includes('anthropic');
    const isTitanModel = BEDROCK_MODEL_ID.includes('amazon.titan');
    const isQwenModel = BEDROCK_MODEL_ID.includes('qwen');

    let requestBody: any;

    if (isClaudeModel) {
      // Claude API format
      requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt,
          },
        ],
      };
    } else if (isTitanModel) {
      // Amazon Titan API format
      requestBody = {
        inputText: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
        textGenerationConfig: {
          maxTokenCount: 4096,
          temperature: 0.7,
          topP: 0.9,
        },
      };
    } else if (isQwenModel) {
      // Qwen API format - uses OpenAI Chat Completions format
      requestBody = {
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.9,
      };
    } else {
      throw new Error(`Unsupported model: ${BEDROCK_MODEL_ID}`);
    }

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    console.log(`[Bedrock] Received response from model`);

    // Extract the spec from the response based on model type
    let content: string;
    if (isClaudeModel) {
      content = responseBody.content[0].text;
    } else if (isTitanModel) {
      content = responseBody.results[0].outputText;
    } else if (isQwenModel) {
      // Qwen uses OpenAI Chat Completions response format
      content = responseBody.choices[0].message.content;
    } else {
      throw new Error('Unable to parse response');
    }

    const spec = extractJsonFromResponse(content);

    // Validate and return
    return validateSpec(spec, blueprint);
  } catch (error: any) {
    console.error(`[Bedrock] Error: ${error.message}`);

    // Check for access denied errors
    if (
      error.name === 'AccessDeniedException' ||
      error.message?.includes('access') ||
      error.message?.includes('not enabled')
    ) {
      throw new BedrockAccessError(BEDROCK_REGION, BEDROCK_MODEL_ID);
    }

    throw new Error(`Failed to generate spec: ${error.message}`);
  }
}

/**
 * Build system prompt for spec generation
 */
function buildSystemPrompt(blueprint: string): string {
  return `You are an expert system architect for AWS-based applications. Your task is to generate a detailed application specification based on user requirements.

You must output ONLY valid JSON in the following exact schema:

{
  "name": "app-name",
  "blueprint": "${blueprint}",
  "pages": [
    {
      "route": "/",
      "components": ["Header", "TodoList", "Footer"],
      "title": "Home"
    }
  ],
  "api": [
    {
      "path": "/api/todos",
      "method": "GET",
      "handler": "listTodos",
      "description": "List all todos",
      "requiresAuth": false
    }
  ],
  "dataModel": [
    {
      "table": "Todos",
      "partitionKey": "id",
      "sortKey": null,
      "attributes": [
        { "name": "id", "type": "string", "required": true },
        { "name": "title", "type": "string", "required": true },
        { "name": "completed", "type": "boolean", "required": true },
        { "name": "createdAt", "type": "string", "required": true }
      ],
      "secondaryIndexes": []
    }
  ],
  "auth": false,
  "envVars": [
    {
      "name": "API_KEY",
      "description": "External API key for third-party service",
      "required": false
    }
  ],
  "customDomain": false
}

Rules:
1. Output ONLY the JSON object, no markdown, no explanations
2. Keep it simple and practical
3. For serverless: use DynamoDB tables, Lambda handlers, API Gateway endpoints
4. For containers: use PostgreSQL models, Express routes, containerized services
5. Include only necessary endpoints and data models
6. Set auth:true only if authentication is explicitly required
7. Be concise but complete`;
}

/**
 * Build user prompt
 */
function buildUserPrompt(prompt: string, blueprint: string): string {
  return `Generate an application specification for the following requirements using the ${blueprint} blueprint:

${prompt}

Output the complete JSON specification following the schema exactly. Include all necessary pages, API endpoints, and data models.`;
}

/**
 * Extract JSON from Claude's response
 */
function extractJsonFromResponse(content: string): any {
  // Try to parse directly
  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    // Try to find JSON object in text
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return JSON.parse(objectMatch[0]);
    }

    throw new Error('Could not extract valid JSON from response');
  }
}

/**
 * Validate spec structure
 */
function validateSpec(spec: any, blueprint: string): AppSpec {
  if (!spec.name || typeof spec.name !== 'string') {
    throw new Error('Spec must include a valid name');
  }

  if (spec.blueprint !== blueprint) {
    spec.blueprint = blueprint;
  }

  if (!Array.isArray(spec.pages)) {
    spec.pages = [];
  }

  if (!Array.isArray(spec.api)) {
    spec.api = [];
  }

  if (!Array.isArray(spec.dataModel)) {
    spec.dataModel = [];
  }

  if (!Array.isArray(spec.envVars)) {
    spec.envVars = [];
  }

  spec.auth = spec.auth === true;
  spec.customDomain = spec.customDomain === true;

  // Validate each page
  spec.pages = spec.pages.filter(
    (page: any) =>
      page.route &&
      typeof page.route === 'string' &&
      Array.isArray(page.components)
  );

  // Validate each API endpoint
  spec.api = spec.api.filter(
    (endpoint: any) =>
      endpoint.path &&
      endpoint.method &&
      endpoint.handler &&
      ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(endpoint.method)
  );

  // Validate data models
  spec.dataModel = spec.dataModel.filter(
    (model: any) =>
      model.table &&
      model.partitionKey &&
      Array.isArray(model.attributes)
  );

  console.log(`[Bedrock] Validated spec: ${spec.name}`);
  return spec as AppSpec;
}

/**
 * Test Bedrock access
 */
export async function testBedrockAccess(
  credentials: AssumedCredentials
): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = new BedrockRuntimeClient({
      region: BEDROCK_REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
      },
    });

    const isClaudeModel = BEDROCK_MODEL_ID.includes('anthropic');
    const isTitanModel = BEDROCK_MODEL_ID.includes('amazon.titan');
    const isQwenModel = BEDROCK_MODEL_ID.includes('qwen');

    let requestBody: any;

    if (isClaudeModel) {
      requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 10,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      };
    } else if (isTitanModel) {
      requestBody = {
        inputText: 'Hello',
        textGenerationConfig: {
          maxTokenCount: 10,
          temperature: 0.7,
        },
      };
    } else if (isQwenModel) {
      // Qwen uses OpenAI Chat Completions format
      requestBody = {
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
        max_tokens: 10,
        temperature: 0.7,
        top_p: 0.9,
      };
    } else {
      return { ok: false, error: `Unsupported model: ${BEDROCK_MODEL_ID}` };
    }

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    await client.send(command);
    return { ok: true };
  } catch (error: any) {
    if (
      error.name === 'AccessDeniedException' ||
      error.message?.includes('access') ||
      error.message?.includes('not enabled')
    ) {
      const isTitanModel = BEDROCK_MODEL_ID.includes('amazon.titan');
      return {
        ok: false,
        error: isTitanModel
          ? `Access denied to Bedrock model in ${BEDROCK_REGION}. Verify IAM permissions include bedrock:InvokeModel.`
          : `Access denied to Bedrock model in ${BEDROCK_REGION}. For Anthropic models, first-time users may need to submit use case details. Go to AWS Console → Bedrock → Model catalog, select ${BEDROCK_MODEL_ID}, and try it in the playground to complete setup.`,
      };
    }

    return { ok: false, error: error.message };
  }
}

/**
 * Generate functional React component code using Bedrock
 */
export async function generateComponentCode(
  spec: AppSpec,
  credentials: AssumedCredentials
): Promise<GeneratedCode> {
  console.log(`[Bedrock] Generating component code for: ${spec.name}`);

  const client = new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  const systemPrompt = buildComponentSystemPrompt();
  const userPrompt = buildComponentUserPrompt(spec);

  try {
    const isClaudeModel = BEDROCK_MODEL_ID.includes('anthropic');
    const isTitanModel = BEDROCK_MODEL_ID.includes('amazon.titan');
    const isQwenModel = BEDROCK_MODEL_ID.includes('qwen');

    let requestBody: any;

    if (isClaudeModel) {
      requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 8000,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      };
    } else if (isTitanModel) {
      requestBody = {
        inputText: `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`,
        textGenerationConfig: {
          maxTokenCount: 8000,
          temperature: 0.3,
          topP: 0.9,
        },
      };
    } else if (isQwenModel) {
      // Qwen API format - uses OpenAI Chat Completions format
      requestBody = {
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        max_tokens: 8000,
        temperature: 0.3,
        top_p: 0.9,
      };
    } else {
      throw new Error(`Unsupported model: ${BEDROCK_MODEL_ID}`);
    }

    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    let content: string;
    if (isClaudeModel) {
      content = responseBody.content[0].text;
    } else if (isTitanModel) {
      content = responseBody.results[0].outputText;
    } else if (isQwenModel) {
      // Qwen uses OpenAI Chat Completions response format
      content = responseBody.choices[0].message.content;
    } else {
      throw new Error('Unable to parse response');
    }

    const generatedCode = extractJsonFromResponse(content);
    console.log(`[Bedrock] Generated code for ${Object.keys(generatedCode.pages || {}).length} pages and ${Object.keys(generatedCode.components || {}).length} components`);

    return generatedCode as GeneratedCode;
  } catch (error: any) {
    console.error(`[Bedrock] Error generating components: ${error.message}`);
    throw new Error(`Failed to generate components: ${error.message}`);
  }
}

function buildComponentSystemPrompt(): string {
  return `You are an expert React and TypeScript developer. Generate fully functional React components with proper TypeScript types, API integration, and modern best practices.

Output ONLY valid JSON in this exact format:
{
  "pages": {
    "/": "import React from 'react';\\n\\nexport default function Home() {\\n  return <div>Home</div>;\\n}"
  },
  "components": {
    "TodoList": "import React from 'react';\\n\\nexport function TodoList() {\\n  return <div>Todo List</div>;\\n}"
  },
  "lib": {
    "api": "let apiUrl: string | null = null;\\\\n\\\\nasync function getApiUrl() {\\\\n  if (apiUrl) return apiUrl;\\\\n  try {\\\\n    const res = await fetch('/config.json');\\\\n    const config = await res.json();\\\\n    apiUrl = config.apiUrl.replace(/\\\\/+$/, '');\\\\n  } catch {\\\\n    apiUrl = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(/\\\\/+$/, '');\\\\n  }\\\\n  return apiUrl;\\\\n}\\\\n\\\\nexport async function getTodos() {\\\\n  const base = await getApiUrl();\\\\n  const res = await fetch(\\`\\${base}/todos\\`);\\\\n  return res.json();\\\\n}",
    "types": "export interface Todo { id: string; title: string; }"
  }
}

CRITICAL Requirements:
1. All code must be valid TypeScript with proper types
2. ALWAYS define TypeScript types/interfaces in lib/types.ts and import them where needed
3. NEVER import types from components - define all shared types in lib/types.ts
4. Each component file must be self-contained with all necessary exports
5. Use React hooks (useState, useEffect, etc.)
6. Include API calls using fetch() with error handling
7. Add proper loading and error states
8. Use inline styles with Tailwind-like utility classes
9. Make components interactive and functional
10. Include form validation where appropriate
11. Escape all special characters in JSON strings (\\n for newlines, \\" for quotes, etc.)
12. Output ONLY the JSON object, no markdown, no explanations
13. Pages should be Next.js page components (default export)
14. Components should be named exports
15. lib/api.ts should import types from lib/types.ts, NOT from components`;
}

function buildComponentUserPrompt(spec: AppSpec): string {
  const pages = spec.pages.map(p => `- ${p.route}: ${p.title || 'Page'} (components: ${p.components.join(', ')})`).join('\n');
  const endpoints = spec.api.map(e => `- ${e.method} ${e.path}: ${e.description || ''}`).join('\n');
  const models = spec.dataModel.map(m => `- ${m.table}: ${m.attributes.map(a => `${a.name} (${a.type})`).join(', ')}`).join('\n');

  return `Generate fully functional React components for this application:

**App Name:** ${spec.name}

**Pages:**
${pages}

**API Endpoints:**
${endpoints}

**Data Model:**
${models}

Generate:
1. lib/types.ts - TypeScript interfaces for data models, API types, and component props
2. lib/api.ts - API utility that loads config from /config.json at runtime and provides typed helper functions
3. components - Reusable React components with forms, lists, and full interactivity
4. pages - Next.js page components that fetch data and display it with loading and error states

CRITICAL: Define ALL TypeScript types in lib/types.ts and import them. Load API URL from /config.json at runtime, not from environment variables.

Make the app beautiful with modern inline styles and responsive design.`;
}
