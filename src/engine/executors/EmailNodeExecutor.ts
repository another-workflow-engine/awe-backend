import { DataIntegrityError } from "../../errors/DataIntegrity.js";
import { FeelDataType, NodeTypes } from "../../types/enums.js";
import type { EvaluatedContext, ExecutorResult } from "../../types/engine.js";
import { isValidFeelType } from "../../utils/feel.utils.js";
import { contextUtils } from "../../utils/context.utils.js";
import { getEmailProvider } from "../services/email/emailProviderRegistry.js";
import { Executor } from "./Executor.js";

type EmailExecutionResult = {
  status: "sent" | "failed";
  provider: string;
  messageId?: string;
  accepted?: string[];
  rejected?: string[];
  response?: string;
  error?: string;
};

export class EmailNodeExecutor extends Executor<typeof NodeTypes.EMAIL> {
  private mapEmailResultToOutput(
    emailResult: EmailExecutionResult,
  ): ExecutorResult | null {
    for (const dataMap of this.configuration.responseMap ?? []) {
      const value = contextUtils.getByJsonPath(emailResult, dataMap.jsonPath);
      if (value === undefined) {
        return this.getFailedResult(
          `\"${dataMap.jsonPath}\" is missing from email execution result`,
        );
      }

      if (!isValidFeelType(value, dataMap.type)) {
        return this.getFailedResult(
          `\"${dataMap.jsonPath}\" not of type ${dataMap.type}`,
        );
      }

      this.outputVariables[dataMap.contextVariableName] = value;
    }

    return null;
  }

  async execute(evaluatedContext: EvaluatedContext): Promise<ExecutorResult> {
    try {
      const provider = getEmailProvider(this.configuration.provider);

      const from = contextUtils
        .getFeelEvaluatedValue(
          this.configuration.senderExpression,
          evaluatedContext,
          FeelDataType.STRING,
        )
        .trim();

      if (!from) {
        throw new DataIntegrityError(
          "Email sender evaluated to an empty string",
        );
      }

      const authUser = contextUtils
        .getFeelEvaluatedValue(
          this.configuration.authUserExpression,
          evaluatedContext,
          FeelDataType.STRING,
        )
        .trim();

      const authPass = contextUtils
        .getFeelEvaluatedValue(
          this.configuration.authPassExpression,
          evaluatedContext,
          FeelDataType.STRING,
        )
        .trim();

      if (!authUser || !authPass) {
        throw new DataIntegrityError(
          "Email authentication expressions must resolve to non-empty strings",
        );
      }

      const to = (this.configuration.to ?? [])
        .map((recipient) =>
          contextUtils
            .getFeelEvaluatedValue(
              recipient.valueExpression,
              evaluatedContext,
              FeelDataType.STRING,
            )
            .trim(),
        )
        .filter((value) => value.length > 0);

      if (to.length === 0) {
        throw new DataIntegrityError(
          "Email node must resolve at least one To recipient",
        );
      }

      const cc = (this.configuration.cc ?? [])
        .map((recipient) =>
          contextUtils
            .getFeelEvaluatedValue(
              recipient.valueExpression,
              evaluatedContext,
              FeelDataType.STRING,
            )
            .trim(),
        )
        .filter((value) => value.length > 0);

      const bcc = (this.configuration.bcc ?? [])
        .map((recipient) =>
          contextUtils
            .getFeelEvaluatedValue(
              recipient.valueExpression,
              evaluatedContext,
              FeelDataType.STRING,
            )
            .trim(),
        )
        .filter((value) => value.length > 0);

      const subject = contextUtils.getFeelEvaluatedValue(
        this.configuration.subjectExpression,
        evaluatedContext,
        FeelDataType.STRING,
      );
      const text = contextUtils.getFeelEvaluatedValue(
        this.configuration.bodyExpression,
        evaluatedContext,
        FeelDataType.STRING,
      );

      const sendResult = await provider.send(
        {
          from,
          to,
          cc,
          bcc,
          subject,
          text,
        },
        {
          username: authUser,
          password: authPass,
        },
      );

      const emailResult: EmailExecutionResult = {
        status: "sent",
        provider: this.configuration.provider,
        messageId: sendResult.messageId,
        accepted: sendResult.accepted,
        rejected: sendResult.rejected,
        ...(sendResult.response ? { response: sendResult.response } : {}),
      };

      this.outputVariables.email = emailResult;
      this.outputVariables.emailStatus = "sent";

      const mappedResult = this.mapEmailResultToOutput(emailResult);
      if (mappedResult) {
        return mappedResult;
      }

      return await this.getCompletedResult();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown email error";

      const failure: EmailExecutionResult = {
        status: "failed",
        provider: this.configuration.provider,
        error: message,
      };

      this.outputVariables.email = failure;
      this.outputVariables.emailStatus = "failed";

      if (this.configuration.failurePolicy === "continue") {
        return await this.getCompletedResult();
      }

      return this.getFailedResult("Email send failed", {
        provider: this.configuration.provider,
        error: message,
      });
    }
  }
}
