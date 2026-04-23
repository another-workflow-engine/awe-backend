import { db } from "../database.js";
import { RepositoryError } from "../errors/RepositoryError.js";
import type { DbTransaction } from "../types/models.js";

export const nodeConfigurationRepository = {
  findByNodeId: async (
    nodeId: string,
    transaction?: DbTransaction,
  ): Promise<unknown | null> => {
    try {
      const result = await (transaction ?? db)
        .selectFrom("node")
        .select("configuration")
        .where("id", "=", nodeId)
        .where("is_deleted", "=", false)
        .executeTakeFirst();

      return result?.configuration ?? null;
    } catch (err) {
      throw new RepositoryError(
        `Find node configuration by node_id=${nodeId} failed`,
        err,
      );
    }
  },
};
