import { GoogleGenAI } from "@google/genai";
import Config from "../../config.js";
import {
  type ScriptExecutionResult,
  type ScriptExecutionService,
  ScriptExecutionResultSchema,
} from "../../types/engine.js";
import { converterUtils } from "../../utils/converter.utils.js";

export class GeminiService implements ScriptExecutionService {
  private googleGenAI!: GoogleGenAI;

  private buildGeminiPrompt(
    sourceCode: string,
    entryFunctionName: string,
    parameters: unknown[],
  ): string {
    return `
You are a STRICT Python execution engine.

Execute the Python code (DO NOT explain).

CODE:
${sourceCode}

FUNCTION:
${entryFunctionName}

INPUT:
${JSON.stringify(parameters)}

RULES:
- Return ONLY valid JSON
- No explanation
- No markdown
- Do NOT include backticks
- Do NOT include logs like throughSignature
- Output format → {"success": true, "output": {...}}
- If error → {"success": false, "output": {...}} 
- Incase of error, the output should include stack trace or details.
`;
  }

  async executeScript(
    credentials: Record<string, string>,
    sourceCode: string,
    entryFunctionName: string,
    parameters: unknown[],
    _signal?: AbortSignal,
  ): Promise<ScriptExecutionResult> {
    const prompt = this.buildGeminiPrompt(
      sourceCode,
      entryFunctionName,
      parameters,
    );

    let apiKey = credentials.apiKey;

    if (!apiKey) {
      apiKey = Config.GEMINI_API_KEY;
    }    

    this.googleGenAI = new GoogleGenAI({
      apiKey,
    });

    const response = await this.googleGenAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [prompt],
      config: {
        tools: [{ codeExecution: {} }],
      },
    });

    let rawOutput = "";

    const parts = response.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if ("codeExecutionResult" in part) {
        rawOutput = part.codeExecutionResult.output ?? "";
        break;
      }

      if (part.text) {
        rawOutput = part.text;
      }
    }

    if (!rawOutput.trim()) {
      return { success: false, output: { error: "No output from model" } };
    }

    try {
      const parsedJson = JSON.parse(rawOutput);

      return converterUtils.parseOrThrow(
        ScriptExecutionResultSchema,
        parsedJson,
      );
    } catch {
      return {
        success: false,
        output: { error: "Failed to parse model output", raw: rawOutput },
      };
    }
  }
}
