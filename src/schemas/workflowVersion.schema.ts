import { z } from "zod";
import { ActorSchema } from "./actor.schema.js";

export const WorkflowVersionDetailRequest = z.object({
  workflowId: z.uuidv4(),
  version: z.coerce.number().min(1),
  actor: ActorSchema,
});
