import { z } from "zod";

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const PaginationMetadataSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;
