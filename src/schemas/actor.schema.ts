import { z } from "zod";
import { ActorTypes } from "../types/enums.js";

export const ActorSchema = z.object({
  id: z.uuidv4(),
  type: z.enum([ActorTypes.API_KEY_CLIENT, ActorTypes.ORGANIZATION_ACCOUNT]),
});
