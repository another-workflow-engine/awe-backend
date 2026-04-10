import type { ExpressionBuilder, AliasedExpression, SelectType } from "kysely";

export const columnMapper = {
  prefixedColumns<T extends object>(
    eb: ExpressionBuilder<any, any>,
    table: string,
    columns: (keyof T & string)[],
  ): AliasedExpression<SelectType<unknown>, string>[] {
    return columns.map((col) =>
      eb.ref(`${table}.${col}`).as(`${table}__${col}`),
    );
  },
  extractPrefixed<T>(result: Record<string, unknown>, table: string): T {
    return Object.fromEntries(
      Object.entries(result)
        .filter(([k]) => k.startsWith(`${table}__`))
        .map(([k, v]) => [k.replace(`${table}__`, ""), v]),
    ) as T;
  },
};
