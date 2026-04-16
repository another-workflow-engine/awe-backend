import type { Transaction } from "kysely";
import { nodeConfigurationRepository } from "../repositories/nodeConfiguration.repository.js";
import type { DB } from "../types/database.js";

export const nodeConfigurationService = {
  getByNodeId: async (
    nodeId: string,
    transaction?: Transaction<DB>,
  ): Promise<unknown | null> => {
    return await nodeConfigurationRepository.findByNodeId(nodeId, transaction);
  },
};
