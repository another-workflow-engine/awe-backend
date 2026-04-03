import { z } from "zod";
import { FeelDataType, NodeTypes, TimeUnit } from "../types/enums.js";

export const FeelDataTypeSchema = z.enum([
  FeelDataType.NUMBER,
  FeelDataType.STRING,
  FeelDataType.BOOLEAN,
  FeelDataType.DATE,
  FeelDataType.TIME,
  FeelDataType.DATETIME,
  FeelDataType.LIST,
  FeelDataType.OBJECT,
  FeelDataType.NULL,
]);

const HttpHeaderSchema = z.object({
  key: z.string(),
  valueExpression: z.string(),
});

export const StartNodeConfigurationSchema = z.object({
  inputDataMap: z.array(
    z.object({
      jsonPath: z.string(),
      dataType: FeelDataTypeSchema,
      contextVariableName: z.string(),
      fetchableId: z.string().optional(),
    }),
  ),

  fetchables: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      method: z.enum(["GET"]),
      headers: z.array(HttpHeaderSchema).optional(),
      urlExpression: z.string(),
    }),
  ),
});

export const EndNodeConfigurationSchema = z.object({
  success: z.boolean(),
  resultMap: z.array(
    z.object({
      variableName: z.string(),
      valueExpression: z.string(),
    }),
  ),
  message: z.string().optional(),
});

export const UserNodeConfigurationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  maxAttempts: z.number().optional().default(1),

  requestMap: z.array(
    z.object({
      label: z.string(),
      valueExpression: z.string(),
    }),
  ),

  responseMap: z.array(
    z.object({
      fieldId: z.string(),
      label: z.string(),
      contextVariableName: z.string(),
      type: FeelDataTypeSchema,

      uiType: z
        .enum([
          "text",
          "textarea",
          "number",
          "dropdown",
          "checkbox",
          "date-picker",
        ])
        .optional(),

      options: z
        .array(
          z.object({
            label: z.string().optional(),
            valueExpression: z.string(),
          }),
        )
        .optional(),
    }),
  ),
});

const ServiceBodySchema = z.object({
  jsonPath: z.string(),
  valueExpression: z.string(),
});

const ServiceResponseSchema = z.object({
  jsonPath: z.string(),
  type: FeelDataTypeSchema,
  contextVariableName: z.string(),
});

const BackoffSchema = z
  .object({
    type: z.enum(["fixed", "exponential"]),
    delay: z.number().positive().optional().default(1000),
    unit: z.enum(TimeUnit).optional().default(TimeUnit.MILLISECOND),
  })

export const ServiceNodeConfigurationSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  urlExpression: z.string(),

  maxAttempts: z.number().optional().default(1),
  timeoutMs: z.number().optional(),
  backoff: BackoffSchema,

  body: z.array(ServiceBodySchema).optional(),
  headers: z.array(HttpHeaderSchema).optional(),

  responseMap: z.array(ServiceResponseSchema),
});

export const ScriptNodeConfigurationSchema = z.object({
  runtime: z.literal("python3"),
  maxAttempts: z.number().optional().default(1),
  backoff: BackoffSchema,
  sourceCode: z.string(),
  entryFunctionName: z.string(),
  executionService: z.enum(["jdoodle", "gemini"]).optional().default("jdoodle"),

  parameterMap: z.array(
    z.object({
      name: z.string(),
      valueExpression: z.string(),
    }),
  ),

  responseMap: z.array(
    z.object({
      jsonPath: z.string(),
      type: FeelDataTypeSchema,
      contextVariableName: z.string(),
    }),
  ),
});

export const DecisionNodeConfigurationSchema = z.object({
  rules: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      conditionExpression: z.string(),
    }),
  ),
  defaultRule: z.object({
    id: z.literal("default"),
    label: z.string().optional(),
  }),
});

export const NodeSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal(NodeTypes.START),
      configuration: StartNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal(NodeTypes.USER),
      configuration: UserNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal(NodeTypes.SERVICE),
      configuration: ServiceNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal(NodeTypes.SCRIPT),
      configuration: ScriptNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal(NodeTypes.DECISION),
      configuration: DecisionNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal(NodeTypes.END),
      configuration: EndNodeConfigurationSchema,
    }),
  ])
  .and(
    z.object({
      id: z.string(),
      label: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .nullable()
        .optional(),
    }),
  );

export const EdgeSchema = z.object({
  id: z.string(),
  label: z.string().nullable().optional(),
  sourceNodeId: z.string(),
  targetNodeId: z.string().nullable().optional(),
  ruleId: z
    .union([z.string(), z.literal("default")])
    .nullable()
    .optional(),
});
