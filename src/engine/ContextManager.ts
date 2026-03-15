import type { JsonValue } from "../types/database.js";
import { converterUtils } from "../utils/converter.utils.js";
import type { WorkflowContext } from "./types.js";

export const contextManager = {
  create(): WorkflowContext {
    return { global: {} };
  },

  merge(
    context: WorkflowContext,
    vars: Record<string, unknown>,
  ): WorkflowContext {
    let newContext = { ...context, global: { ...context.global } };
    newContext.global.constants = {
      ...(newContext.global.constants ?? {}),
      ...vars,
    };

    return newContext;
  },

  resolveForNode(context: WorkflowContext): Record<string, unknown> {
    return { ...context.global };
  },

  fromJson(json: JsonValue): WorkflowContext {
    const obj = converterUtils.jsonValueToObject(json);
    return {
      global: (obj.global as Record<string, unknown>) ?? {},
    };
  },
};
