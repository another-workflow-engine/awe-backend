import type { Request, Response } from "express";
import { userTaskService } from "../services/userTask.service.js";
import { UserTaskParamsSchema } from "../schemas/task.schema.js";

export const userTaskController = {
  list: async (req: Request, res: Response) => {
    const pendingTasks = await userTaskService.getPending(req.actor);
    const tasks = pendingTasks.map((task) => ({
      id: task.id,
      title: task.title,
      assignee: task.assignee,
      created_on: task.createdAt,
      status: "in_progress",
      instance_id: task.workflow.instanceId,
      workflow_name: task.workflow.name,
      node_configuration: null,
      node_id: "",
    }));
    return res.json({ tasks });
  },

  getTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const data = await userTaskService.get(taskId, req.actor);
    return res.json({
      task: {
        id: data.id,
        title: data.title,
        assignee: data.assignee,
        status: data.status,
        created_on: data.startedAt,
        instance_id: data.workflow.instanceId,
        node_id: "",
        workflow_name: data.workflow.name,
        node_configuration: {
          title: data.title,
          description: "",
          assignee: data.assignee,
          requestMap: data.requestData,
          responseMap: data.responseData,
        },
      },
    });
  },

  completeUserTask: async (req: Request, res: Response) => {
    const { taskId } = UserTaskParamsSchema.parse(req.params);
    const execution = await userTaskService.completeUserTask(
      taskId,
      req.body ?? {},
      req.actor,
    );
    return res.json({
      status: execution.status,
      completed_at: execution.ended_on,
    });
  },
};
