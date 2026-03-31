import axios from "axios";
import { JDoodleConfig } from "../config/jdoodle.config";
import type { ScriptExecutionResult } from "../types/script.execution";

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
    const stdin = JSON.stringify({ params: parameters });

    const wrappedScript = `${sourceCode}

import json
import sys
import io

def safe_serialize(obj):
    try:
        import numpy as np
    except:
        np = None
    def convert(o):
        if np is not None and isinstance(o, np.ndarray):
            return o.tolist()
        try:
            return o.tolist()
        except:
            pass
        if isinstance(o,set):
            return [convert(i) for i in o]
        elif isinstance(o,tuple):
            return [convert(i) for i in o]
        elif isinstance(o,dict):
            return {k: convert(v) for k, v in o.items()}
        elif isinstance(o,list):
            return [convert(i) for i in o]
        else:
            return str(o)
    return convert(obj)

if __name__ == "__main__":
    try:
        captured_output = io.StringIO()
        sys.stdout = captured_output

        raw_input = json.loads(input())
        params = raw_input['params']

        result = ${entryFunctionName}(*params)

        sys.stdout = sys.__stdout__

        result = safe_serialize(result)

        print(json.dumps(result))

    except Exception as e:
        sys.stdout = sys.__stdout__
        print(json.dumps({"error": str(e)}))
`;
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

      // Throw structured error for proper classification
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
