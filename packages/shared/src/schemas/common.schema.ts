import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  q: z.string().trim().max(100).optional(),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1),
  total: z.number().int().min(0),
  total_pages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: PaginationMetaSchema,
  });
}

export function createSingleResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: itemSchema,
  });
}
