import { z } from "zod";

export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(),
  search: z.string().optional(),
});

export const PaginationMetadataSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;
export type PaginationMetadata = z.infer<typeof PaginationMetadataSchema>;

export const calculatePagination = (
  total: number,
  page: number,
  limit: number,
): PaginationMetadata => {
  const normalizedTotal = Number(total);
  const safeTotal = Number.isFinite(normalizedTotal) ? normalizedTotal : 0;

  return {
    total: safeTotal,
    page,
    limit,
    totalPages: Math.ceil(safeTotal / limit),
  };
};

export const calculateOffset = (page: number, limit: number): number => {
  return (page - 1) * limit;
};
