import axios from "axios";
import { JDoodleConfig } from "../config/jdoodle.config";
import type { ScriptExecutionResult } from "../types/script.execution";
import {
  buildJDoodleStdin,
  wrapScriptForJDoodle,
} from "../utils/scriptExecution.utils";

export interface JDoodleResponse {
  output: string;
  statusCode: number;
  memory: string;
  cpuTime: string;
}

export class JDoodleService {
  static async executeScript(
    sourceCode: string,
    entryFunctionName: string,
    parameters: any[],
  ): Promise<ScriptExecutionResult> {
    const stdin = buildJDoodleStdin(parameters);
    const wrappedScript = wrapScriptForJDoodle(sourceCode, entryFunctionName);

    try {
      const response = await axios.post(JDoodleConfig.endpoint, {
        clientId: JDoodleConfig.clientId,
        clientSecret: JDoodleConfig.clientSecret,
        script: wrappedScript,
        language: "python3",
        versionIndex: "5",
        stdin,
        libs: [],
      });

      let parsedOutput;

      try {
        const rawOutput = response.data.output || "";
        const trimmed = rawOutput.trim();
        const lastLine = rawOutput.split("\n").pop();
        parsedOutput = lastLine ? JSON.parse(lastLine) : null;
      } catch {
        parsedOutput = response.data.output;
      }

      return {
        parsedOutput,
        rawOutput: response.data.output,
      };
    } catch (error: any) {
      console.error("JDoodle Error:", error?.response?.data || error.message);
      const errorMessage =
        error?.response?.data?.error ||
        error.message ||
        "Code execution failed";

      throw new Error(
        JSON.stringify({
          errorSource: "JDoodle",
          message: errorMessage,
          details: error?.response?.data || error.message,
        }),
      );
    }
  }
}
