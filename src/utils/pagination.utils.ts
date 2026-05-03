import type { Request } from "express";
import { PaginationParamsSchema } from "../schemas/pagination.schema.js";

export type ParsedPagination = {
  page: number;
  limit: number;
  offset: number;
};

type PaginationResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  const normalizedTotal = Number(total);
  const safeTotal = Number.isFinite(normalizedTotal) ? normalizedTotal : 0;

  return {
    [dataKey]: items,
    pagination: {
      total: safeTotal,
      page,
      limit,
      totalPages: Math.ceil(safeTotal / limit),
    },
  };
};

export const paginationUtils = {
  getOffset: (page: number, limit: number): number => {
    return (page - 1) * limit;
  },

  getPaginationResponse: (
    total: number,
    page: number,
    limit: number,
  ): PaginationResponse => {
    return {
      page,
      limit,
      total: total,
      totalPages: Math.ceil(total / limit),
    };
  },
};
