import type { Request, Response } from "express";
import { eventLogService } from "../services/eventLog.service.js";
import z from "zod";

const instanceIdParamSchema = z.object({
  instanceId: z.string().uuid(),
});

export const auditController = {
  getInstanceAudit: async (req: Request, res: Response): Promise<void> => {
    const { instanceId } = instanceIdParamSchema.parse(req.params);
    const audit = await eventLogService.getInstanceAudit(instanceId, req.actor);
    if (!audit) {
      res.status(404).json({ error: "Instance not found" });
      return;
    }
    res.json(audit);
  },
};