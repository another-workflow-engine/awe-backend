import { instanceRepository } from "../repositories/instance.repository.js";
import type { InstanceCreateSchema } from "../schemas/instance.schema.js";
import type { ActorModel } from "../types/models.js";
import { z } from "zod";
import { workflowVersionService } from "./workflowVersion.service.js";
import { NotFoundError } from "../errors/NotFoundError.js";
import { InstanceStatuses } from "../types/enums.js";
import { db } from "../database.js";
import { taskService } from "./task.service.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { Transaction } from "kysely";
import type { DB } from "../types/database.js";

export type CreateVersionInput = z.infer<typeof InstanceCreateSchema>;

export const instanceService = {
  createNew: async (data: CreateVersionInput, actor: ActorModel) => {
    const workflowVersion =
      await workflowVersionService.getActiveVersionByWorkflowId(
        data.workflowId,
      );
    if (!workflowVersion) {
      throw new NotFoundError("No active workflow version found");
    }

    db.transaction().execute(async (transaction) => {
      const instance = await instanceRepository.insert(
        {
          workflow_version_id: workflowVersion.id,

          started_on: new Date(),
          status: InstanceStatuses.IN_PROGRESS,
          input_variables: converterUtils.objectToJsonValue(data.context),

          created_by: actor.id,
        },
        transaction,
      );

      const currentVaribles = await taskService.executeStartNode(
        instance,
        transaction,
      );
      await instanceService.updateContextVariables(
        instance.id,
        currentVaribles,
        transaction,
      );
    });
  },

  updateContextVariables: async (
    instanceId: string,
    data: object,
    transaction?: Transaction<DB>,
  ) => {
    instanceRepository.updateById(
      instanceId,
      {
        current_variables: converterUtils.objectToJsonValue(data),
      },
      transaction,
    );
  },
};
