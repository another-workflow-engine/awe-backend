import { GoogleGenAI } from "@google/genai";
import Config from "../config";
import type { ScriptExecutionResult } from "../types/script.execution";
import { buildGeminiPrompt } from "../utils/scriptExecution.utils";

const genAI = new GoogleGenAI({ apiKey: Config.GEMINI_API_KEY! });

export class GeminiService {
  static async executeScript(
    sourceCode: string,
    entryFunctionName: string,
    parameters: any[],
  ): Promise<ScriptExecutionResult> {
    const prompt = buildGeminiPrompt(sourceCode, entryFunctionName, parameters);

    const result = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [prompt],
      config: {
        tools: [{ codeExecution: {} }],
      },
    });

    let rawOutput = "";

    const parts = result?.candidates?.[0]?.content?.parts || [];

    for (const part of parts) {
      if (part.codeExecutionResult?.output) {
        rawOutput = part.codeExecutionResult.output;
        break;
      }

      if (part.text) {
        rawOutput = part.text;
      }
    }

    if (!rawOutput) {
      throw new Error(
        JSON.stringify({
          errorSource: "Gemini",
          message: "No output received from Gemini",
          details: "Empty response from Gemini API",
        }),
      );
    }

    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error(
        JSON.stringify({
          errorSource: "Gemini",
          message: "Invalid Gemini output format",
          details: rawOutput,
        }),
      );
    }

    const cleanJson = jsonMatch[0];

    let parsedOutput;

    try {
      parsedOutput = JSON.parse(cleanJson);
    } catch (err) {
      throw new Error(
        JSON.stringify({
          errorSource: "Gemini",
          message: "JSON parsing failed for Gemini output",
          details: cleanJson,
        }),
      );
    }

    if (
      parsedOutput &&
      typeof parsedOutput === "object" &&
      "result" in parsedOutput
    ) {
      parsedOutput = parsedOutput.result;
    }

    return {
      parsedOutput,
      rawOutput: cleanJson,
    };
  }
}
