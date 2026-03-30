import { GoogleGenAI } from "@google/genai";
import type { ScriptExecutionResult } from "../types/script.execution";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export class GeminiService {
  static async executeScript(
    sourceCode: string,
    entryFunctionName: string,
    parameters: any[],
  ): Promise<ScriptExecutionResult> {
    const prompt = `
You are a STRICT Python execution engine.

Execute the Python code logically (DO NOT explain).

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
- If error → {"error": "message"}
- Output format → {"result": ...}
`;

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
      throw new Error("No output received from Gemini");
    }

    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Invalid Gemini output: " + rawOutput);
    }

    const cleanJson = jsonMatch[0];

    let parsedOutput;

    try {
      parsedOutput = JSON.parse(cleanJson);
    } catch (err) {
      throw new Error("JSON parsing failed: " + cleanJson);
    }

    return {
      parsedOutput,
      rawOutput: cleanJson,
    };
  }
}
