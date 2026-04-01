import type { ScriptExecutionService } from "../types/script.execution.js";
import { GeminiService } from "./gemini.service.js";
import { JDoodleService } from "./jdoodle.service.js";

const executionServiceRegistry: Record<string, ScriptExecutionService> = {
  gemini: new GeminiService(),
  jdoodle: new JDoodleService(),
};

export class ExecutionServiceFactory {
  static get(type: string): ScriptExecutionService {
    const service = executionServiceRegistry[type];
    if (service === undefined) {
      throw new Error(`Unknown execution service type: ${type}`);
    }
    return service;
  }

  static has(type: string): boolean {
    return type in executionServiceRegistry;
  }

  static getDefault(): ScriptExecutionService {
    return executionServiceRegistry.jdoodle!;
  }
}
