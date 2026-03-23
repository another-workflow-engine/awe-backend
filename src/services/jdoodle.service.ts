import axios from "axios";
import { JDoodleConfig } from "../config/jdoodle.config";

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
    parameters: any[]
  ): Promise<any> {

    const stdin = JSON.stringify({ params: parameters });

    const wrappedScript = `def main(name,age):
${sourceCode}

import json
import sys
import io

def convert(obj):
    if isinstance(obj,set):
        return [convert(i) for i in obj]
    elif isinstance(obj,tuple):
        return [convert(i) for i in obj]
    elif isinstance(obj,dict):
        return {k: convert(v) for k, v in obj.items()}
    elif isinstance(obj,list):
        return [convert(i) for i in obj]
    else:
        return obj

if __name__ == "__main__":
    try:
        captured_output = io.StringIO()
        sys.stdout = captured_output

        raw_input = json.loads(input())
        params = raw_input['params']

        result = ${entryFunctionName}(*params)

        sys.stdout = sys.__stdout__

        result = convert(result)

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
        const rawOutput = response.data.output.trim();
        const lastLine = rawOutput.split("\n").pop();
        parsedOutput = JSON.parse(lastLine || "");
      } catch {
        parsedOutput = response.data.output;
      }

      return {
        parsedOutput,
        rawOutput: response.data.output,
      };

    } catch (error: any) {
      console.error("JDoodle Error:", error?.response?.data || error.message);
      throw new Error(error?.response?.data?.error || "Code execution failed");
    }
  }
}