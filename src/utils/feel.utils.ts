import { evaluate } from "@bpmn-io/feelin";
import type { Warning, WarningType } from "@bpmn-io/feelin/dist/interpreter.js";

export type FeelValidationResult = {
  valid: boolean;
  error?: string;
};

const EXPECTED_RUNTIME_WARNINGS: WarningType[] = [
  "NO_VARIABLE_FOUND",
  "NO_CONTEXT_ENTRY_FOUND",
  "NO_PROPERTY_FOUND",
  "INVALID_TYPE",
  "FUNCTION_INVOCATION_FAILURE",
];

const DISALLOWED_OPERATORS = [
  { pattern: /===/, message: "Use '=' for equality comparison, not '==='" },
  { pattern: /!==/, message: "Use '!=' for inequality comparison, not '!=='" },
  {
    pattern: /(?<![!<>])={2}(?!=)/,
    message: "Use '=' for equality comparison, not '=='",
  },
];

const STATIC_URL_REGEX = /^https?:\/\/[^\s]+$/;

const FEEL_EXPRESSION_INDICATORS =
  /[+\-*/]|\.[\w]+|[\w]+\s*\(|context\.|".*"\s*\+|\+\s*".*"/;

function checkDisallowedOperators(expression: string): string | null {
  for (const { pattern, message } of DISALLOWED_OPERATORS) {
    if (pattern.test(expression)) {
      return message;
    }
  }
  return null;
}

export function isStaticUrl(value: string): boolean {
  return STATIC_URL_REGEX.test(value.trim());
}

export function isFeelExpression(value: string): boolean {
  const trimmed = value.trim();

  if (isStaticUrl(trimmed)) {
    return false;
  }

  return FEEL_EXPRESSION_INDICATORS.test(trimmed);
}

export function validateFeelExpression(
  expression: string,
): FeelValidationResult {
  if (!expression || !expression.trim()) {
    return { valid: false, error: "Expression is empty" };
  }
  const operatorError = checkDisallowedOperators(expression);
  if (operatorError) {
    return { valid: false, error: operatorError };
  }

  try {
    const result = evaluate(expression, {});

    if (!result.warnings || result.warnings.length === 0) {
      return { valid: true };
    }

    const syntaxErrors = result.warnings.filter((warning: Warning) => {
      return !EXPECTED_RUNTIME_WARNINGS.includes(warning.type);
    });

    if (syntaxErrors.length === 0) {
      return { valid: true };
    }

    return {
      valid: false,
      error: syntaxErrors.map((w) => w.message).join("; "),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      error: `Failed to parse expression: ${errorMessage}`,
    };
  }
}

export function validateUrlExpression(value: string): FeelValidationResult {
  if (!value || !value.trim()) {
    return { valid: false, error: "URL expression is empty" };
  }

  const trimmed = value.trim();

  const result = validateFeelExpression(trimmed);
  if (result.valid) {
    return result;
  }

  if (isStaticUrl(trimmed)) {
    return {
      valid: false,
      error:
        "URL must be a FEEL expression. Use a FEEL string literal like \"https://api.example.com\" or a dynamic FEEL expression.",
    };
  }

  return result;
}

export function validateConditionExpression(
  expression: string,
): FeelValidationResult {
  const result = validateFeelExpression(expression);
  if (!result.valid) {
    return result;
  }

  const trimmed = expression.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return {
      valid: false,
      error:
        "Condition expression should evaluate to a boolean, not a string literal",
    };
  }

  return { valid: true };
}
