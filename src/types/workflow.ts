import { z } from "zod";
import {
  StartNodeConfigurationSchema,
  EndNodeConfigurationSchema,
  UserNodeConfigurationSchema,
  ServiceNodeConfigurationSchema,
  ScriptNodeConfigurationSchema,
  DecisionNodeConfigurationSchema,
  NodeSchema,
  EdgeSchema,
} from "../schemas/node.schema.js";

export type StartNodeConfiguration = z.infer<
  typeof StartNodeConfigurationSchema
>;

export type EndNodeConfiguration = z.infer<typeof EndNodeConfigurationSchema>;

export type UserNodeConfiguration = z.infer<typeof UserNodeConfigurationSchema>;

export type ServiceNodeConfiguration = z.infer<
  typeof ServiceNodeConfigurationSchema
>;

export type ScriptNodeConfiguration = z.infer<
  typeof ScriptNodeConfigurationSchema
>;

export type DecisionNodeConfiguration = z.infer<
  typeof DecisionNodeConfigurationSchema
>;

export type Node = z.infer<typeof NodeSchema>;

export type Edge = z.infer<typeof EdgeSchema>;

export type StartNode = Extract<Node, { type: "start" }>;

