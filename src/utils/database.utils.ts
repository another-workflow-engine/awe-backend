import { db } from "../database.js";
import type { DbTransaction } from "../types/models.js";

export async function openTransaction<T>(
  callback: (transaction: DbTransaction) => Promise<T>,
): Promise<T> {
  return await db.transaction().execute(callback);
}
