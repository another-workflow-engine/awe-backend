import z from "zod";
import { FeelDataTypeSchema } from "./node.schema.js";

export const UrlSettingsSchema = z.object({
  urlExpression: z.string(),
  headers: z.record(z.string(), z.string()),
});

export const FetchableSettingsSchema = z.object({
  urlId: z.string(),
  jsonPath: z.string(),
  dataType: FeelDataTypeSchema,
});

export const ContextSchema = z.object({
  constants: z.record(z.string(), z.unknown()).default({}), // variableName: value
  fetchables: z.record(z.string(), FetchableSettingsSchema).default({}), // variableName: FetchableSettings
  urls: z.record(z.string(), UrlSettingsSchema).default({}), // urlId: settings
  secrets: z.record(z.string(), z.string()).default({}), // variableName: secretId
});
