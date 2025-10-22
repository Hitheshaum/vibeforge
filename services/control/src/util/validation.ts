import { z } from 'zod';
import { Blueprint, Environment } from '@aws-vibe/shared';

/**
 * Validation schemas
 */

export const awsAccountIdSchema = z
  .string()
  .regex(/^\d{12}$/, 'AWS Account ID must be 12 digits');

export const awsRegionSchema = z
  .string()
  .regex(/^[a-z]{2}-[a-z]+-\d{1}$/, 'Invalid AWS region format');

export const appNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9-]*$/, 'App name must start with letter and contain only alphanumeric characters and hyphens');

export const blueprintSchema = z.nativeEnum(Blueprint);

export const environmentSchema = z.nativeEnum(Environment);

export const promptSchema = z
  .string()
  .min(10)
  .max(5000);

/**
 * Request validation schemas
 */

export const checkConnectionRequestSchema = z.object({
  accountId: awsAccountIdSchema,
  region: awsRegionSchema.optional(),
});

export const generateRequestSchema = z.object({
  accountId: awsAccountIdSchema,
  region: awsRegionSchema,
  blueprint: blueprintSchema,
  prompt: promptSchema,
  appName: appNameSchema,
});

export const publishRequestSchema = z.object({
  accountId: awsAccountIdSchema,
  region: awsRegionSchema,
  appId: z.string().uuid(),
  confirm: z.boolean().refine((val) => val === true, {
    message: 'Confirm must be true to publish to production',
  }),
});

export const destroyRequestSchema = z.object({
  accountId: awsAccountIdSchema,
  region: awsRegionSchema,
  appId: z.string().uuid(),
  env: environmentSchema,
  confirm: z.boolean().refine((val) => val === true, {
    message: 'Confirm must be true to destroy resources',
  }),
});

/**
 * Validate and parse request data
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: any): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Validation failed: ${messages}`);
    }
    throw error;
  }
}
