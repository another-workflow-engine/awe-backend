export function buildGeminiPrompt(
  sourceCode: string,
  entryFunctionName: string,
  parameters: unknown[],
): string {
  return `You are a STRICT Python execution engine.

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
}

const JDoodle_PYTHON_WRAPPER_TEMPLATE = `import json
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

        result = {ENTRY_FUNCTION_NAME}(*params)

        sys.stdout = sys.__stdout__

        result = safe_serialize(result)

        print(json.dumps(result))

    except Exception as e:
        sys.stdout = sys.__stdout__
        print(json.dumps({"error": str(e)}))`;


export function wrapScriptForJDoodle(
  sourceCode: string,
  entryFunctionName: string,
): string {
  const wrapper = JDoodle_PYTHON_WRAPPER_TEMPLATE.replace(
    "{ENTRY_FUNCTION_NAME}",
    entryFunctionName,
  );
  return `${sourceCode}\n\n${wrapper}`;
}

export function buildJDoodleStdin(parameters: unknown[]): string {
  return JSON.stringify({ params: parameters });
}
