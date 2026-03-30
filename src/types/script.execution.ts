export interface ScriptExecutionResult {
  parsedOutput: any;
  rawOutput: string;
}

export interface ScriptExecutionService {
  executeScript(
    sourceCode: string,
    entryFunctionName: string,
    parameters: any[],
  ): Promise<ScriptExecutionResult>;
}
