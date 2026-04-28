import type { Request } from "express";
import {
  PaginationParamsSchema,
  type PaginationMetadata,
} from "../schemas/pagination.schema.js";

export type ParsedPagination = {
  page: number;
  limit: number;
  offset: number;
};

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

export const parsePaginationFromRequest = (req: Request): ParsedPagination => {
  const { page, limit } = PaginationParamsSchema.parse(req.query);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
};

export const buildPaginatedResponse = <T>(
  dataKey: string,
  items: T[],
  total: number,
  page: number,
  limit: number,
) => {
  return {
    [dataKey]: items,
    pagination: calculatePagination(total, page, limit),
  };
};
