import { z } from "zod";
import {
  BackoffType,
  FeelDataType,
  NodeTypes,
  TimeUnit,
  Runtime,
  ScriptExecutionService,
} from "../types/enums.js";
import { HttpMethodSchema } from "../types/http.js";

export const FeelDataTypeSchema = z.enum(FeelDataType);

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

export const StartNodeDataMapSchema = z
  .object({
    jsonPath: z.string(),
    dataType: FeelDataTypeSchema,
    contextVariableName: z.string(),
    fetchableId: z.string().optional(),
    required: z.boolean().default(true),
    defaultValue: z.unknown().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fetchableId) {
      return;
    }

    if (value.required === false && value.defaultValue === undefined) {
      ctx.addIssue({
        code: "custom",
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
  inputDataMap: z.array(StartNodeDataMapSchema).default([]),
  fetchables: z.array(FetchableSchema).default([]),
  secretDataMap: z.array(SecretDataMapSchema).default([]),
});

export const EndNodeConfigurationSchema = z.object({
  success: z.boolean().default(true),
  resultMap: z
    .array(
      z.object({
        variableName: z.string(),
        valueExpression: z.string(),
      }),
    )
    .default([]),
  message: z.string().optional(),
});

export const UserNodeConfigurationSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  assignee: z.string().optional(),
  maxAttempts: z.number().default(1),

  requestMap: z.array(
    z.object({
      label: z.string(),
      valueExpression: z.string(),
    }),
  ),

  responseMap: z.array(
    z
      .object({
        fieldId: z.string(),
        label: z.string(),
        contextVariableName: z.string(),
        type: FeelDataTypeSchema,
        required: z.boolean().default(true),
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
      })
      .superRefine((value, ctx) => {
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

const ServiceBodySchema = z.object({
  jsonPath: z.string(),
  valueExpression: z.string(),
});

const ServiceResponseSchema = z.object({
  jsonPath: z.string(),
  type: FeelDataTypeSchema,
  contextVariableName: z.string(),
});

export const BackoffSchema = z.object({
  type: z.enum(BackoffType),
  delay: z.number().positive().default(1000),
  unit: z.enum(TimeUnit).default(TimeUnit.MILLISECOND),
});

export const TimeoutSchema = z.object({
  delay: z.number().positive(),
  unit: z.enum(TimeUnit).default(TimeUnit.MILLISECOND),
});

function normalizeLegacyTimeout(config: unknown): unknown {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return config;
  }

  const normalizedConfig = {
    ...(config as Record<string, unknown>),
  };

  if (
    normalizedConfig.timeout === undefined &&
    typeof normalizedConfig.timeoutMs === "number" &&
    Number.isFinite(normalizedConfig.timeoutMs) &&
    normalizedConfig.timeoutMs > 0
  ) {
    normalizedConfig.timeout = {
      delay: normalizedConfig.timeoutMs,
      unit: TimeUnit.MILLISECOND,
    };
  }

  return normalizedConfig;
}

function withLegacyTimeoutCompatibility<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(normalizeLegacyTimeout, schema);
}

const ServiceNodeConfigurationBaseSchema = z.object({
  method: HttpMethodSchema,
  urlExpression: z.string(),

  maxAttempts: z.number().default(1),
  timeout: TimeoutSchema.optional(),
  backoff: BackoffSchema,
  body: z.array(ServiceBodySchema).optional(),
  headers: z.array(HttpHeaderSchema).optional(),

  responseMap: z.array(ServiceResponseSchema),
});

export const ServiceNodeConfigurationSchema = withLegacyTimeoutCompatibility(
  ServiceNodeConfigurationBaseSchema,
);

export const JdoodleCredentialsSchema = z
  .object({
    clientId: z.string(),
    clientSecret: z.string(),
  })
  .nullable()
  .optional();

export const GeminiCredentialsSchema = z
  .object({
    apiKey: z.string(),
  })
  .nullable()
  .optional();

const ScriptNodeConfigurationBaseSchema = z
  .discriminatedUnion("serviceType", [
    z.object({
      serviceType: z.literal(ScriptExecutionService.JDOODLE),
      credentials: JdoodleCredentialsSchema,
    }),
    z.object({
      serviceType: z.literal(ScriptExecutionService.GEMINI),
      credentials: GeminiCredentialsSchema,
    }),
  ])
  .and(
    z.object({
      runtime: z.enum(Runtime).default(Runtime.PYTHON_3),
      maxAttempts: z.number().default(1),
      timeout: TimeoutSchema.optional(),
      backoff: BackoffSchema,
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
          contextVariableName: z.string(),
        }),
      ),
    }),
  );

export const ScriptNodeConfigurationSchema = withLegacyTimeoutCompatibility(
  ScriptNodeConfigurationBaseSchema,
);

const EmailRecipientSchema = z.object({
  valueExpression: z.string(),
});

export const EmailNodeConfigurationSchema = z.object({
  provider: z.enum(["google_smtp"]),
  senderExpression: z.string(),
  authUserExpression: z.string(),
  authPassExpression: z.string(),
  to: z.array(EmailRecipientSchema),
  cc: z.array(EmailRecipientSchema).default([]),
  bcc: z.array(EmailRecipientSchema).default([]),
  subjectExpression: z.string(),
  bodyExpression: z.string(),
  maxAttempts: z.number().default(1),
  backoff: BackoffSchema,
  failurePolicy: z.enum(["fail", "continue"]).default("fail"),
  responseMap: z.array(ServiceResponseSchema).default([]),
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
