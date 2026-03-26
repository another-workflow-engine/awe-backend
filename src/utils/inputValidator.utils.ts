import { FeelDataType } from "../types/enums.js";
import { evaluate } from "@bpmn-io/feelin";
import type { ContextVariables } from "../types/engine.js";
import { contextUtils } from "./context.utils.js";

export type InputValidationResult = {
  valid: boolean;
  error?: string;
  value?: unknown;
};

export type FieldValidationError = {
  field: string;
  error: string;
};

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const TIME_REGEX = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;

const DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/;

const EMPTY_CONTEXT: ContextVariables = {
  constants: {},
  fetchables: {},
  urls: {},
};

export function validateDataType(
  value: unknown,
  expectedType: FeelDataType,
  fieldName: string,
): InputValidationResult {
  if (expectedType === FeelDataType.NULL) {
    if (value === null || value === undefined) {
      return { valid: true, value: null };
    }
    return {
      valid: false,
      error: `Field '${fieldName}' must be null`,
    };
  }

  if (value === null || value === undefined) {
    return { valid: true, value };
  }

  switch (expectedType) {
    case FeelDataType.STRING:
      if (typeof value !== "string") {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a string, got ${typeof value}`,
        };
      }
      return { valid: true, value };

    case FeelDataType.NUMBER:
      if (typeof value !== "number" || Number.isNaN(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a number, got ${typeof value}`,
        };
      }
      return { valid: true, value };

    case FeelDataType.BOOLEAN:
      if (typeof value !== "boolean") {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a boolean, got ${typeof value}`,
        };
      }
      return { valid: true, value };

    case FeelDataType.DATE:
      if (typeof value !== "string" || !DATE_REGEX.test(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a valid date string (YYYY-MM-DD)`,
        };
      }
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return {
          valid: false,
          error: `Field '${fieldName}' contains an invalid date`,
        };
      }
      return { valid: true, value };

    case FeelDataType.TIME:
      if (typeof value !== "string" || !TIME_REGEX.test(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a valid time string (HH:MM:SS)`,
        };
      }
      return { valid: true, value };

    case FeelDataType.DATETIME:
      if (typeof value !== "string" || !DATETIME_REGEX.test(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be a valid datetime string (ISO 8601)`,
        };
      }
      const datetime = new Date(value);
      if (isNaN(datetime.getTime())) {
        return {
          valid: false,
          error: `Field '${fieldName}' contains an invalid datetime`,
        };
      }
      return { valid: true, value };

    case FeelDataType.LIST:
      if (!Array.isArray(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be an array, got ${typeof value}`,
        };
      }
      return { valid: true, value };

    case FeelDataType.OBJECT:
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
          valid: false,
          error: `Field '${fieldName}' must be an object`,
        };
      }
      return { valid: true, value };

    default:
      return { valid: true, value };
  }
}

export function validateField(
  input: Record<string, unknown>,
  fieldKey: string,
  expectedType: FeelDataType,
  required: boolean = false,
  defaultValue?: unknown,
): InputValidationResult {
  let value = input[fieldKey];

  if (value === undefined || value === null) {
    if (defaultValue !== undefined) {
      value = defaultValue;
    } else if (required) {
      return {
        valid: false,
        error: `Required field '${fieldKey}' is missing`,
      };
    } else {
      return { valid: true, value: undefined };
    }
  }

  return validateDataType(value, expectedType, fieldKey);
}

export async function evaluateValidationExpression(
  validationExpression: string,
  fieldValue: unknown,
  fieldName: string,
  contextVariables: ContextVariables = EMPTY_CONTEXT,
): Promise<InputValidationResult> {
  try {
    const feelContext = await contextUtils.evaluateContext(contextVariables);

    const result = evaluate(validationExpression, feelContext);

    if (result.warnings && result.warnings.length > 0) {
      return {
        valid: false,
        error: `Validation expression failed for '${fieldName}': ${result.warnings.map((w) => w.message).join("; ")}`,
      };
    }

    if (result.value !== true) {
      return {
        valid: false,
        error: `Validation failed for field '${fieldName}'`,
      };
    }

    return { valid: true, value: fieldValue };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: `Validation expression error for '${fieldName}': ${errorMessage}`,
    };
  }
}

export type InputFieldConfig = {
  jsonPath: string;
  dataType: FeelDataType;
  contextVariableName: string;
  required?: boolean | undefined;
  default?: unknown;
  fetchableId?: string | undefined;
};

export type ResponseFieldConfig = {
  fieldId: string;
  type: FeelDataType;
  required?: boolean | undefined;
  default?: unknown;
  validationExpression?: string | undefined;
};

function checkUnexpectedFields(
  input: Record<string, unknown>,
  expectedFields: Set<string>,
  contextType: string,
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  for (const inputKey of Object.keys(input)) {
    if (!expectedFields.has(inputKey)) {
      errors.push({
        field: inputKey,
        error: `Unexpected field '${inputKey}' - this field is not defined in the ${contextType}`,
      });
    }
  }

  return errors;
}

export function validateInstanceInput(
  input: Record<string, unknown>,
  inputDataMap: InputFieldConfig[],
): FieldValidationError[] {
  const errors: FieldValidationError[] = [];

  const nonFetchableFields = inputDataMap.filter((field) => !field.fetchableId);

  const expectedFields = new Set(
    nonFetchableFields.map((field) => field.jsonPath),
  );

  errors.push(
    ...checkUnexpectedFields(input, expectedFields, "workflow configuration"),
  );

  for (const field of nonFetchableFields) {
    const result = validateField(
      input,
      field.jsonPath,
      field.dataType as FeelDataType,
      field.required ?? false,
      field.default,
    );

    if (!result.valid && result.error) {
      errors.push({
        field: field.jsonPath,
        error: result.error,
      });
    }
  }

  return errors;
}

export async function validateUserTaskInput(
  userInput: Record<string, unknown>,
  responseMap: ResponseFieldConfig[],
  contextVariables: ContextVariables = EMPTY_CONTEXT,
): Promise<FieldValidationError[]> {
  const errors: FieldValidationError[] = [];

  const expectedFields = new Set(responseMap.map((field) => field.fieldId));

  errors.push(
    ...checkUnexpectedFields(userInput, expectedFields, "task configuration"),
  );

  for (const field of responseMap) {
    const typeResult = validateField(
      userInput,
      field.fieldId,
      field.type as FeelDataType,
      true,
    );

    if (!typeResult.valid && typeResult.error) {
      errors.push({
        field: field.fieldId,
        error: typeResult.error,
      });
      continue;
    }

    if (field.validationExpression && typeResult.value !== undefined) {
      const validationResult = await evaluateValidationExpression(
        field.validationExpression,
        typeResult.value,
        field.fieldId,
        contextVariables,
      );

      if (!validationResult.valid && validationResult.error) {
        errors.push({
          field: field.fieldId,
          error: validationResult.error,
        });
      }
    }
  }

  return errors;
}
