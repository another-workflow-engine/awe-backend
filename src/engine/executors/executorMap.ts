import type { NodeType } from "../../types/database.js";
import type { Context } from "../../types/engine.js";
import { NodeTypes } from "../../types/enums.js";
import type { NodeModel } from "../../types/models.js";
import type { Executor } from "./Executor.js";
import { DecisionNodeExecutor } from "./DecisionNodeExecutor.js";
import { EndNodeExecutor } from "./EndNodeExecutor.js";
import { ScriptNodeExecutor } from "./ScriptNodeExecutor.js";
import { ServiceNodeExecutor } from "./ServiceNodeExecuter.js";
import { StartNodeExecutor } from "./StartNodeExecutor.js";

export type ExecutorConstructor = new (
  node: NodeModel,
  inputVariables: Context,
  executionId: string,
) => Executor<NodeType>;

export const executorMap: Record<
  Exclude<NodeType, typeof NodeTypes.USER>,
  ExecutorConstructor
> = {
  [NodeTypes.START]: StartNodeExecutor,
  [NodeTypes.SERVICE]: ServiceNodeExecutor,
  [NodeTypes.SCRIPT]: ScriptNodeExecutor,
  [NodeTypes.DECISION]: DecisionNodeExecutor,
  [NodeTypes.END]: EndNodeExecutor,
};
