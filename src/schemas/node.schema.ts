import { z } from "zod";
import { FeelDataType, NodeTypes, TimeUnit } from "../types/enums.js";
import { HttpMethodSchema } from "../types/http.js";

export const FeelDataTypeSchema = z.enum(Object.values(FeelDataType));

const HttpHeaderSchema = z.object({
  key: z.string(),
  valueExpression: z.string(),
});

export const FetchableSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  method: z.enum(["GET"]),
  headers: z.array(HttpHeaderSchema).optional(),
  urlExpression: z.string(),
});

export const StartNodeDataMapSchema = z.object({
  jsonPath: z.string(),
  dataType: FeelDataTypeSchema,
  contextVariableName: z.string(),
  fetchableId: z.string().optional(),
  required: z.boolean().optional().default(true),
  defaultValue: z.unknown().optional(),
}).superRefine((value, ctx) => {
  if (value.fetchableId) {
    return;
  }

  if (value.required === false && value.defaultValue === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["defaultValue"],
      message: "Optional start input must define defaultValue",
    });
  }
});

export const SecretDataMapSchema = z.object({
  secretId: z.string(),
  secretVariableName: z.string(),
});

export const StartNodeConfigurationSchema = z.object({
  inputDataMap: z.array(StartNodeDataMapSchema),
  fetchables: z.array(FetchableSchema),
  secretDataMap: z.array(SecretDataMapSchema).default([]),
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
      required: z.boolean().optional().default(true),
      defaultValue: z.unknown().optional(),

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
    }).superRefine((value, ctx) => {
      if (value.required === false && value.defaultValue === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["defaultValue"],
          message: "Optional user input field must define defaultValue",
        });
      }
    }),
  ),
});

export const OnErrorOutputMapSchema = z.discriminatedUnion("fromType", [
  z.object({
    fromType: z.literal("jsonPath"),
    jsonPath: z.string(),
    dataType: FeelDataTypeSchema,
    contextVariableName: z.string(),
  }),
  z.object({
    fromType: z.literal("expression"),
    valueExpression: z.string(),
    contextVariableName: z.string(),
  }),
]);

export const OnErrorConfigurationSchema = z
  .object({
    mode: z.enum(["terminate", "continue"]).optional().default("terminate"),
    outputMap: z.array(OnErrorOutputMapSchema).optional().default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "continue" && value.outputMap.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputMap"],
        message: "onError outputMap must be configured when mode is continue",
      });
    }

    if (value.mode === "terminate" && value.outputMap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outputMap"],
        message: "onError outputMap is only allowed when mode is continue",
      });
    }
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

const BackoffSchema = z.object({
  type: z.enum(["fixed", "exponential"]),
  delay: z.number().positive().optional().default(1000),
  unit: z.enum(TimeUnit).optional().default(TimeUnit.MILLISECOND),
});

export const ServiceNodeConfigurationSchema = z.object({
  method: HttpMethodSchema,
  urlExpression: z.string(),

  maxAttempts: z.number().optional().default(1),
  timeoutMs: z.number().int().positive().optional(),
  backoff: BackoffSchema,
  onError: OnErrorConfigurationSchema.optional().default({
    mode: "terminate",
    outputMap: [],
  }),

  body: z.array(ServiceBodySchema).optional(),
  headers: z.array(HttpHeaderSchema).optional(),

  responseMap: z.array(ServiceResponseSchema),
});

export const ScriptNodeConfigurationSchema = z.object({
  runtime: z.literal("python3"),
  maxAttempts: z.number().optional().default(1),
  timeoutMs: z.number().int().positive().optional(),
  backoff: BackoffSchema,
  onError: OnErrorConfigurationSchema.optional().default({
    mode: "terminate",
    outputMap: [],
  }),
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

const EmailRecipientSchema = z.object({
  valueExpression: z.string(),
});

export const EmailNodeConfigurationSchema = z.object({
  provider: z.string().min(1).default("google_smtp"),
  senderExpression: z.string(),
  authUserExpression: z.string(),
  authPassExpression: z.string(),
  to: z.array(EmailRecipientSchema),
  cc: z.array(EmailRecipientSchema).optional().default([]),
  bcc: z.array(EmailRecipientSchema).optional().default([]),
  subjectExpression: z.string(),
  bodyExpression: z.string(),
  maxAttempts: z.number().optional().default(1),
  backoff: BackoffSchema,
  failurePolicy: z.enum(["fail", "continue"]).optional().default("fail"),
  responseMap: z.array(ServiceResponseSchema).optional().default([]),
});

export const RuleSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  conditionExpression: z.string(),
});

export const DefaultRuleSchema = z.object({
  id: z.literal("default"),
  label: z.string().optional(),
});

export const DecisionNodeConfigurationSchema = z.object({
  rules: z.array(RuleSchema),
  defaultRule: DefaultRuleSchema,
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
      type: z.literal(NodeTypes.EMAIL),
      configuration: EmailNodeConfigurationSchema,
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
