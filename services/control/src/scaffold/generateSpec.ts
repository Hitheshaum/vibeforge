import { AppSpec, Blueprint } from '@aws-vibe/shared';
import { generateSpec as invokeBedrockSpec, generateComponentCode } from '../bedrock';
import { AssumedCredentials } from '../util/aws';

/**
 * Orchestrate spec generation via Bedrock
 */
export async function generateAppSpec(
  prompt: string,
  blueprint: Blueprint,
  credentials: AssumedCredentials,
  onStatus?: (step: string, message: string) => void
): Promise<AppSpec> {
  console.log(`[Scaffold] Generating app spec with blueprint: ${blueprint}`);

  if (onStatus) onStatus('bedrock-spec', 'Generating app specification with AI');

  const spec = await invokeBedrockSpec(
    prompt,
    blueprint,
    credentials
  );

  console.log(`[Scaffold] Generated spec for app: ${spec.name}`);

  // Generate functional React component code
  if (onStatus) onStatus('bedrock-components', 'Generating functional React components with AI');
  console.log(`[Scaffold] Generating functional React components`);
  const generatedCode = await generateComponentCode(spec, credentials);

  spec.generatedCode = generatedCode;
  console.log(`[Scaffold] Generated ${Object.keys(generatedCode.pages || {}).length} pages and ${Object.keys(generatedCode.components || {}).length} components`);

  if (onStatus) onStatus('bedrock-components', `Generated ${Object.keys(generatedCode.pages || {}).length} pages and ${Object.keys(generatedCode.components || {}).length} components`);

  return spec;
}
