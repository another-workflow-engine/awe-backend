const R = "\x1b[0m"; // reset
const BD = "\x1b[1m"; // bold
const DM = "\x1b[2m"; // dim
const RE = "\x1b[31m"; // red
const GR = "\x1b[32m"; // green
const YL = "\x1b[33m"; // yellow
const BL = "\x1b[34m"; // blue
const MG = "\x1b[35m"; // magenta
const CY = "\x1b[36m"; // cyan

function c(color: string, text: string): string {
  return `${color}${text}${R}`;
}

function cb(color: string, text: string): string {
  return `${BD}${color}${text}${R}`;
}

function elapsed(start: Date, end = new Date()): string {
  return c(DM, `${end.getTime() - start.getTime()}ms`);
}

function bar(sym: string, label: string, color: string, width = 60): string {
  const inner = `  ${label}  `;
  const pad = Math.max(0, width - inner.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `${BD}${color}${sym.repeat(left)}${inner}${sym.repeat(right)}${R}`;
}

const NODE_CLR: Record<string, string> = {
  start: BL,
  user: YL,
  decision: MG,
  end: GR,
};
function nodeClr(type: string): string {
  return NODE_CLR[type] ?? CY;
}

function kv(label: string, value: string, pad = 18): string {
  return `  ${c(DM, (label + ":").padEnd(pad))} ${value}`;
}

export const executionLogger = {
  instanceCreated(params: {
    instanceId: string;
    workflowId: string;
    workflowVersionId: string;
    workflowName: string;
    actorId: string;
    autoAdvance: boolean;
    createdAt: Date;
    inputVariables: Record<string, unknown>;
  }): void {
    console.group(bar("═", "INSTANCE  CREATED", CY));
    console.log(kv("Instance ID", cb(CY, params.instanceId)));
    console.log(
      kv("Workflow", `${params.workflowName}  ${c(DM, params.workflowId)}`),
    );
    console.log(kv("Version", c(DM, params.workflowVersionId)));
    console.log(kv("Actor", params.actorId));
    console.log(
      kv("Auto Advance", params.autoAdvance ? c(GR, "true") : c(DM, "false")),
    );
    console.log(kv("Created At", params.createdAt.toISOString()));

    const entries = Object.entries(params.inputVariables);
    if (entries.length > 0) {
      console.log(`\n  ${cb(CY, "Direct Inputs Submitted:")}`);
      console.table(
        entries.map(([name, value]) => ({
          Variable: name,
          Value: JSON.stringify(value),
          Type: typeof value,
        })),
      );
    } else {
      console.log(kv("Direct Inputs", c(DM, "(none)")));
    }
    console.groupEnd();
  },

  nodeStart(params: {
    instanceId: string;
    nodeId: string;
    nodeType: string;
    nodeName: string | null;
    startedAt: Date;
  }): void {
    const clr = nodeClr(params.nodeType);
    console.group(
      bar("─", `NODE  START  ▶  ${params.nodeType.toUpperCase()}`, clr),
    );
    console.log(kv("Instance", c(DM, params.instanceId)));
    console.log(kv("Node ID", params.nodeId));
    console.log(kv("Name", params.nodeName ?? c(DM, "(none)")));
    console.log(kv("Type", cb(clr, params.nodeType.toUpperCase())));
    console.log(kv("Started", params.startedAt.toISOString()));
  },

  nodeComplete(params: {
    instanceId: string;
    nodeId: string;
    nodeType: string;
    startedAt: Date;
    status: string;
    outputKeys: string[];
    error?: string;
  }): void {
    const endedAt = new Date();
    const statusClr =
      params.status === "completed"
        ? GR
        : params.status === "in_progress"
        ? YL
        : RE;

    console.log(
      kv(
        "Status",
        cb(statusClr, params.status.toUpperCase()) +
          `  ${elapsed(params.startedAt, endedAt)}`,
      ),
    );
    console.log(kv("Ended At", endedAt.toISOString()));
    if (params.outputKeys.length > 0) {
      console.log(kv("Output Keys", `[${params.outputKeys.join(", ")}]`));
    }
    if (params.error) {
      console.log(kv("Error", cb(RE, params.error)));
    }
    console.groupEnd();
  },

  contextResolution(params: {
    directVariables: { name: string; value: unknown }[];
    mergedVariables?: { name: string; value: unknown }[];
    fetchableVars: { name: string; urlId: string }[];
  }): void {
    const hasAny =
      params.directVariables.length > 0 ||
      (params.mergedVariables?.length ?? 0) > 0 ||
      params.fetchableVars.length > 0;
    if (!hasAny) return;

    console.group(c(DM, "  Context Resolution"));

    if (params.directVariables.length > 0) {
      console.log(c(DM, "  Direct-input constants:"));
      console.table(
        params.directVariables.map((v) => ({
          Variable: v.name,
          Value: JSON.stringify(v.value),
          Type: typeof v.value,
          Source: "direct input",
        })),
      );
    }

    if ((params.mergedVariables?.length ?? 0) > 0) {
      console.log(c(DM, "  User-task merged variables:"));
      console.table(
        (params.mergedVariables ?? []).map((v) => ({
          Variable: v.name,
          Value: JSON.stringify(v.value),
          Type: typeof v.value,
          Source: "user task output",
        })),
      );
    }

    if (params.fetchableVars.length > 0) {
      console.log(
        c(
          DM + YL,
          "  Fetchable variables (values fetched on-demand — NOT stored):",
        ),
      );
      console.table(
        params.fetchableVars.map((v) => ({
          Variable: v.name,
          "Fetchable ID": v.urlId,
          Note: "resolved via HTTP, not persisted",
        })),
      );
    }

    console.groupEnd();
  },

  fetchableResolved(params: {
    varName: string;
    urlId: string;
    url: string;
    headers: Record<string, string>;
    jsonPath: string;
    value: unknown;
  }): void {
    console.group(c(YL, `  Fetchable: ${params.varName}`));
    console.table([
      {
        Variable: params.varName,
        "URL ID": params.urlId,
        URL: params.url,
        "JSON Path": params.jsonPath,
        Value: JSON.stringify(params.value),
      },
    ]);
    const headerEntries = Object.entries(params.headers);
    if (headerEntries.length > 0) {
      console.log(c(DM, "  Request headers:"));
      console.table(headerEntries.map(([k, v]) => ({ Header: k, Value: v })));
    }
    console.log(
      c(DM, "  ↑ value used for evaluation only — not stored in context or DB"),
    );
    console.groupEnd();
  },

  transition(params: {
    fromNodeId: string;
    fromNodeType: string;
    toNodeIds: string[];
    reason: string;
  }): void {
    const clr = nodeClr(params.fromNodeType);
    console.log(
      cb(clr, `  → TRANSITION`) +
        c(
          DM,
          `  from [${params.fromNodeType.toUpperCase()} ${params.fromNodeId}]`,
        ) +
        cb(CY, `  →  [${params.toNodeIds.join(", ")}]`) +
        c(DM, `  (${params.reason})`),
    );
  },

  decisionEvaluation(params: {
    instanceId: string;
    nodeId: string;
    feelCtxKeys: string[];
    evaluations: {
      expression: string;
      result: unknown;
      matched: boolean;
      destNodeId: string;
    }[];
    selectedIds: string[];
    usedDefault: boolean;
  }): void {
    console.group(
      cb(MG, `  Decision Evaluation  — instance=${params.instanceId}`),
    );
    console.log(kv("FEEL context keys", `[${params.feelCtxKeys.join(", ")}]`));

    if (params.evaluations.length > 0) {
      console.log(`\n  ${c(MG, "Condition Results:")}`);
      console.table(
        params.evaluations.map((e) => ({
          Expression: e.expression,
          Result: JSON.stringify(e.result),
          Matched: e.matched ? "✓  YES" : "✗  no",
          "→ Node": e.destNodeId,
        })),
      );
    }

    if (params.selectedIds.length > 0) {
      const label = params.usedDefault
        ? "(default edge)"
        : "(condition matched)";
      console.log(
        kv(
          "Selected branch",
          cb(MG, params.selectedIds.join(", ")) + `  ${c(DM, label)}`,
        ),
      );
    } else {
      console.warn(cb(RE, "  No branch matched and no default edge!"));
    }
    console.groupEnd();
  },

  userTaskCreated(params: {
    taskId: string;
    instanceId: string;
    nodeId: string;
    createdAt: Date;
    displayData: Record<string, unknown>;
  }): void {
    console.group(bar("─", "USER  TASK  CREATED  ⏸", YL));
    console.log(kv("Task ID", cb(YL, params.taskId)));
    console.log(kv("Instance", c(DM, params.instanceId)));
    console.log(kv("Node ID", params.nodeId));
    console.log(kv("Created At", params.createdAt.toISOString()));
    console.log(kv("Status", c(YL, "AWAITING USER INPUT")));

    const entries = Object.entries(params.displayData);
    if (entries.length > 0) {
      console.log(`\n  ${c(YL, "Display Data Resolved:")}`);
      console.table(
        entries.map(([label, value]) => ({
          Label: label,
          Value: JSON.stringify(value),
        })),
      );
    } else {
      console.log(kv("Display Data", c(DM, "(none)")));
    }
    console.groupEnd();
  },

  userTaskCompleted(params: {
    taskId: string;
    instanceId: string;
    actorId: string;
    completedAt: Date;
    userInput: Record<string, unknown>;
    contextUpdates: Record<string, unknown>;
  }): void {
    console.group(bar("─", "USER  TASK  COMPLETED  ✓", GR));
    console.log(kv("Task ID", cb(GR, params.taskId)));
    console.log(kv("Instance", c(DM, params.instanceId)));
    console.log(kv("Actor", params.actorId));
    console.log(kv("Completed", params.completedAt.toISOString()));

    const inputEntries = Object.entries(params.userInput);
    if (inputEntries.length > 0) {
      console.log(`\n  ${c(GR, "User Input Submitted:")}`);
      console.table(
        inputEntries.map(([field, value]) => ({
          Field: field,
          Value: JSON.stringify(value),
          Type: typeof value,
        })),
      );
    }

    const updateEntries = Object.entries(params.contextUpdates);
    if (updateEntries.length > 0) {
      console.log(`\n  ${c(GR, "Context Variables Updated:")}`);
      console.table(
        updateEntries.map(([name, value]) => ({
          Variable: name,
          Value: JSON.stringify(value),
          Type: typeof value,
        })),
      );
    }
    console.groupEnd();
  },

  endNodeSuccess(params: {
    instanceId: string;
    nodeId: string;
    completedAt: Date;
    message?: string;
    resultMapping: { name: string; value: unknown }[];
    instanceStarted: Date;
  }): void {
    console.group(bar("═", "INSTANCE  COMPLETED  ✅", GR));
    console.log(kv("Instance", cb(GR, params.instanceId)));
    console.log(kv("End Node", params.nodeId));
    console.log(kv("Completed", params.completedAt.toISOString()));
    console.log(
      kv("Duration", elapsed(params.instanceStarted, params.completedAt)),
    );
    if (params.message) {
      console.log(kv("Message", cb(GR, params.message)));
    }
    if (params.resultMapping.length > 0) {
      console.log(`\n  ${c(GR, "Result Mapping Applied:")}`);
      console.table(
        params.resultMapping.map((m) => ({
          Variable: m.name,
          Value: JSON.stringify(m.value),
          Type: typeof m.value,
        })),
      );
    }
    console.groupEnd();
  },

  endNodeFailure(params: {
    instanceId: string;
    nodeId: string;
    failedAt: Date;
    message?: string;
    reason?: string;
    instanceStarted: Date;
  }): void {
    console.group(bar("═", "INSTANCE  FAILED  ❌", RE));
    console.log(kv("Instance", cb(RE, params.instanceId)));
    console.log(kv("End Node", params.nodeId));
    console.log(kv("Failed At", params.failedAt.toISOString()));
    console.log(
      kv("Duration", elapsed(params.instanceStarted, params.failedAt)),
    );
    if (params.message) {
      console.log(kv("Message", c(RE, params.message)));
    }
    if (params.reason) {
      console.log(kv("Reason", c(RE, params.reason)));
    }
    console.groupEnd();
  },

  midNodeFailure(params: {
    instanceId: string;
    nodeId: string;
    nodeType: string;
    failedAt: Date;
    reason: string;
  }): void {
    console.group(
      c(RE + BD, `  ❌  Node FAILED  [${params.nodeType.toUpperCase()}]`),
    );
    console.log(kv("Instance", c(DM, params.instanceId)));
    console.log(kv("Node ID", params.nodeId));
    console.log(kv("Failed At", params.failedAt.toISOString()));
    console.log(kv("Reason", c(RE, params.reason)));
    console.groupEnd();
  },

  instanceSummary(params: {
    instanceId: string;
    workflowVersionId: string;
    startedAt: Date;
    endedAt: Date;
    status: "completed" | "failed";
    completionMessage?: string;
    failureReason?: string;
  }): void {
    const durationMs = params.endedAt.getTime() - params.startedAt.getTime();
    const statusClr = params.status === "completed" ? GR : RE;

    console.group(bar("═", "EXECUTION  SUMMARY", CY));
    console.table([
      {
        "Instance ID": params.instanceId,
        "Workflow Ver": params.workflowVersionId,
        Started: params.startedAt.toISOString(),
        Ended: params.endedAt.toISOString(),
        "Duration (ms)": durationMs,
        Status: params.status.toUpperCase(),
        ...(params.completionMessage
          ? { Message: params.completionMessage }
          : {}),
        ...(params.failureReason ? { Failure: params.failureReason } : {}),
      },
    ]);
    console.log(kv("Final Status", cb(statusClr, params.status.toUpperCase())));
    if (params.completionMessage) {
      console.log(kv("Message", c(GR, params.completionMessage)));
    }
    if (params.failureReason) {
      console.log(kv("Failure", c(RE, params.failureReason)));
    }
    console.groupEnd();

    console.log(c(DM, "─".repeat(60)));
  },
};
