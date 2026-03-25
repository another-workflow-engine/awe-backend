import type { Request } from "express";
import {
  PaginationParamsSchema,
  calculateOffset,
  calculatePagination,
} from "../schemas/pagination.schema.js";

export type PaginatedResult<T> = {
  items: T[];
  total: number;
};

export type ParsedPagination = {
  page: number;
  limit: number;
  offset: number;
};

export const parsePaginationFromRequest = (req: Request): ParsedPagination => {
  const { page, limit } = PaginationParamsSchema.parse(req.query);

  return {
    page,
    limit,
    offset: calculateOffset(page, limit),
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

