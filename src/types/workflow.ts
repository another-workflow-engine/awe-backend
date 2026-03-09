import { FeelDataType } from "./enums.js";

export type ContextVariable = { name: string; scope: "global" | "next" };

export type StartNodeConfiguration = {
  inputDataMap: {
    label?: string;
    jsonPath: string;
    type: FeelDataType;
    contextVariable: ContextVariable;
    required?: boolean;
    default?: unknown;
    validationExpression?: string;
  }[];
};

export type EndNodeConfiguration = {
  success: boolean;
  resultMap: {
    contextVariable: ContextVariable;
    valueExpression: string; // 9 or context.var + 2
    validationExpression?: string;
  }[];
  message?: string;
};

export type UserNodeConfiguration = {
  title?: string;
  description?: string;
  assignee?: string;
  maxAttempts?: number;

  // data to be sent
  requestMap: {
    label: string;
    valueExpression: string;
  }[];

  // data to be received
  responseMap: {
    fieldId: string;
    label: string;
    default?: unknown;
    required?: boolean;
    contextVariable?: ContextVariable;
    type: FeelDataType;

    uiType?:
      | "text"
      | "textarea"
      | "number"
      | "dropdown"
      | "checkbox"
      | "date-picker";
    options?: {
      label?: string;
      valueExpression: string;
    }[];

    validationExpression?: string;
  }[];
};

export type ServiceNodeConfiguration = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  urlExpression: string; // feel expression as '/api/resource/{context.resourceId}'

  maxAttempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;

  body?: {
    jsonPath: string; // obj.var - nested
    valueExpression: string; // 9 or context.var or 9 + 1
  }[];
  headers?: {
    key: string;
    valueExpression: string;
  }[];

  responseMap: {
    jsonPath: string;
    type: FeelDataType;
    contextVariable?: ContextVariable;
    validationExpression?: string; // if var == 9 or len(5)
  }[];

  onError?:
    | "terminate"
    | {
        errorMap: ((
          | {
              jsonPath: string;
              type: FeelDataType;
            }
          | { valueExpression: string }
        ) & { contextVariable: ContextVariable })[];
      };
};

export type ScriptNodeConfiguration = {
  runtime: "python3";
  maxAttempts?: number;
  sourceCode: string;
  entryFunctionName: string;

  parameterMap: {
    name: string;
    valueExpression: string;
  }[];
  responseMap: {
    jsonPath: string;
    type: FeelDataType;
    contextVariable?: ContextVariable;
    validationExpression?: string;
  }[];

  onError?:
    | "terminate"
    | {
        errorMap: {
          valueExpression: string;
          contextVariable: ContextVariable;
        }[];
      };
};

export type DecisionNodeConfiguration = {
  rules: {
    id: string;
    label?: string;
    conditionExpression: string;
  }[];
  defaultRule: {
    id: "default";
    label?: string;
  };
};

export type Node = (
  | { type: "start"; configuration: StartNodeConfiguration }
  | { type: "user"; configuration: UserNodeConfiguration }
  | { type: "service"; configuration: ServiceNodeConfiguration }
  | { type: "script"; configuration: ScriptNodeConfiguration }
  | { type: "decision"; configuration: DecisionNodeConfiguration }
  | { type: "end"; configuration: EndNodeConfiguration }
) & {
  id: string;
  label?: string | null;
  description?: string | null;
  position?: { x: number; y: number } | null;
};

export type Edge = {
  id: string;
  label?: string | null;
  sourceNodeId: string;
  targetNodeId?: string | null;
  ruleId?: string | "default" | null;
};

export type StartNode = Extract<Node, { type: "start" }>;
