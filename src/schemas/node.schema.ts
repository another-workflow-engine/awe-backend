import { z } from "zod";
import { FeelDataType, ContextVariableScopeType } from "../types/enums.js";

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

export const ContextVariableSchema = z.object({
  name: z.string(),
  scope: z.enum([
    ContextVariableScopeType.GLOBAL,
    ContextVariableScopeType.NEXT,
  ]),
});

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
      persist: z.boolean().default(false),
      default: z.unknown().optional(),
      required: z.boolean().optional(),
    }),
  ),

  fetchables: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      method: z.enum(["GET"]),
      headers: HttpHeaderSchema.optional(),
      urlExpression: z.string(),
    }),
  ),
});

export const EndNodeConfigurationSchema = z.object({
  success: z.boolean(),
  resultMap: z.array(
    z.object({
      contextVariable: ContextVariableSchema,
      valueExpression: z.string(),
      validationExpression: z.string().optional(),
    }),
  ),
  message: z.string().optional(),
});

export const UserNodeConfigurationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  maxAttempts: z.number().optional(),

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
      default: z.unknown().optional(),
      required: z.boolean().optional(),
      contextVariable: ContextVariableSchema.optional(),
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

      validationExpression: z.string().optional(),
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
  contextVariable: ContextVariableSchema.optional(),
  validationExpression: z.string().optional(),
});

const ServiceErrorMapItemSchema = z
  .union([
    z.object({
      jsonPath: z.string(),
      type: FeelDataTypeSchema,
    }),
    z.object({
      valueExpression: z.string(),
    }),
  ])
  .and(
    z.object({
      contextVariable: ContextVariableSchema,
    }),
  );

export const ServiceNodeConfigurationSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  urlExpression: z.string(),

  maxAttempts: z.number().optional(),
  timeoutMs: z.number().optional(),
  retryDelayMs: z.number().optional(),

  body: z.array(ServiceBodySchema).optional(),
  headers: z.array(HttpHeaderSchema).optional(),

  responseMap: z.array(ServiceResponseSchema),

  onError: z
    .union([
      z.literal("terminate"),
      z.object({
        errorMap: z.array(ServiceErrorMapItemSchema),
      }),
    ])
    .optional(),
});

export const ScriptNodeConfigurationSchema = z.object({
  runtime: z.literal("python3"),
  maxAttempts: z.number().optional(),
  sourceCode: z.string(),
  entryFunctionName: z.string(),

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
      contextVariable: ContextVariableSchema.optional(),
      validationExpression: z.string().optional(),
    }),
  ),

  onError: z
    .union([
      z.literal("terminate"),
      z.object({
        errorMap: z.array(
          z.object({
            valueExpression: z.string(),
            contextVariable: ContextVariableSchema,
          }),
        ),
      }),
    ])
    .optional(),
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
      type: z.literal("start"),
      configuration: StartNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal("user"),
      configuration: UserNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal("service"),
      configuration: ServiceNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal("script"),
      configuration: ScriptNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal("decision"),
      configuration: DecisionNodeConfigurationSchema,
    }),
    z.object({
      type: z.literal("end"),
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
