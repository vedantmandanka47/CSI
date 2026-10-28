import { z } from 'zod';

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.string().or(z.array(z.string()))).default({}),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export function createErrorEnvelope(
  code: string,
  message: string,
  fields: Record<string, string | string[]> = {},
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      fields,
    },
  };
}
