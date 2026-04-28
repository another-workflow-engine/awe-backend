import Config from "../../config.js";
import { httpService } from "../../services/http.service.js";
import {
  ScriptExecutionResultSchema,
  type ScriptExecutionResult,
  type ScriptExecutionService,
} from "../../types/engine.js";
import { converterUtils } from "../../utils/converter.utils.js";

type JDoodleResponse = {
  output: string;
  error: unknown;
  statusCode: number;
  memory: string;
  cpuTime: string;
  compilationStatus: unknown;
  projectKey: unknown;
  isExecutionSuccess: boolean;
  isCompiled: boolean;
};

const JDoodle_PYTHON_WRAPPER_TEMPLATE = `
import json, sys, io

def safe_serialize(obj):
    try:
        import numpy as np
    except:
        np = None

    def convert(o):
        if isinstance(o, (int, float, bool)) or o is None:
            return o

        if np is not None and isinstance(o, np.ndarray):
            return o.tolist()

        if isinstance(o, set):
            return [convert(i) for i in o]
        elif isinstance(o, tuple):
            return [convert(i) for i in o]
        elif isinstance(o, list):
            return [convert(i) for i in o]
        elif isinstance(o, dict):
            return {k: convert(v) for k, v in o.items()}

        return str(o)

    return convert(obj)

if __name__ == "__main__":
    result = {"success": False, "output": ""}

    try:
        captured_output = io.StringIO()
        sys.stdout = captured_output

        raw_input = json.loads(input())
        params = raw_input['params']
        response = {ENTRY_FUNCTION_NAME}(*params)

        sys.stdout = sys.__stdout__
        result["success"] = True
        result["output"] = safe_serialize(response)
    except Exception as e:
        sys.stdout = sys.__stdout__
        result["success"] = False
        result["output"] = str(e)

    print(json.dumps(result))
`;

export class JDoodleService implements ScriptExecutionService {
  private wrapScriptForJDoodle(
    sourceCode: string,
    entryFunctionName: string,
  ): string {
    const wrapper = JDoodle_PYTHON_WRAPPER_TEMPLATE.replace(
      "{ENTRY_FUNCTION_NAME}",
      entryFunctionName,
    );
    return `${sourceCode}\n\n${wrapper}`;
  }

  private buildJDoodleStdin(parameters: unknown[]): string {
    return JSON.stringify({ params: parameters });
  }

  async executeScript(
    credentials: Record<string, string>,
    sourceCode: string,
    entryFunctionName: string,
    parameters: unknown[],
    signal?: AbortSignal,
  ): Promise<ScriptExecutionResult> {
    const stdin = this.buildJDoodleStdin(parameters);
    const wrappedScript = this.wrapScriptForJDoodle(
      sourceCode,
      entryFunctionName,
    );

    let clientId = credentials.clientId;
    let clientSecret = credentials.clientSecret;

    if (!clientId ) {
      clientId = Config.JDOODLE_CLIENT_ID;
    }

    if (!clientSecret) {
      clientSecret = Config.JDOODLE_CLIENT_SECRET;
    }


    const response = await httpService.post<JDoodleResponse>(
      "https://api.jdoodle.com/v1/execute",
      {
        body: {
          clientId,
          clientSecret,
          script: wrappedScript,
          language: "python3",
          versionIndex: "5",
          stdin,
          libs: [],
        },
        ...(signal ? { signal } : {}),
      },
    );

    const rawOutput = response.data.output;

    try {
      const parsedJson = JSON.parse(response.data.output);
      return converterUtils.parseOrThrow(
        ScriptExecutionResultSchema,
        parsedJson,
      );
    } catch {
      return {
        success: false,
        output: { error: "Failed to parse JDoodle output", raw: rawOutput },
      };
    }
  }
}
