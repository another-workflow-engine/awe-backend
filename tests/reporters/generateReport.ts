import * as fs from "fs";
import * as path from "path";

interface AssertionResult {
  title: string;
  fullName: string;
  ancestorTitles: string[];
  status: "passed" | "failed" | "pending" | "skipped";
  duration: number | null;
  failureMessages: string[];
}

interface TestSuiteResult {
  name: string;
  assertionResults: AssertionResult[];
  status: "passed" | "failed";
  startTime: number;
  endTime: number;
}

interface JestResult {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: TestSuiteResult[];
  startTime: number;
  success: boolean;
}

function sanitizeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/`/g, "'").replace(/\n/g, " ").slice(0, 150);
}

function deriveExpected(title: string): string {
  const patterns: Array<[RegExp, string]> = [
    [/returns? (.+?) when/i, "$1"],
    [/returns? (.+?)$/i, "$1"],
    [/throws? (.+)/i, "throws $1"],
    [/calls? (.+)/i, "$1 called"],
    [/enqueues? (.+)/i, "job enqueued"],
    [/marks? (.+)/i, "status updated"],
    [/propagates? (.+)/i, "error propagated"],
    [/skips? (.+)/i, "processing skipped"],
  ];
  for (const [pattern, template] of patterns) {
    const m = title.match(pattern);
    if (m) {
      return m[1] ? template.replace("$1", m[1]).slice(0, 80) : template.slice(0, 80);
    }
  }
  return "—";
}

const reportJsonPath = path.resolve(process.cwd(), "test-report.json");
const reportMdPath = path.resolve(process.cwd(), "test-report.md");

if (!fs.existsSync(reportJsonPath)) {
  console.error(`Error: test-report.json not found at ${reportJsonPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(reportJsonPath, "utf-8");
const data: JestResult = JSON.parse(raw);

const runDate = new Date(data.startTime).toISOString();
const totalDurationMs = data.testResults.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
const totalDurationSec = (totalDurationMs / 1000).toFixed(2);

const lines: string[] = [];

lines.push(`# Test Report`);
lines.push(``);
lines.push(`| | |`);
lines.push(`|---|---|`);
lines.push(`| **Run date** | ${runDate} |`);
lines.push(`| **Duration** | ${totalDurationSec}s |`);
lines.push(`| **Total** | ${data.numTotalTests} |`);
lines.push(`| **Passed** | ${data.numPassedTests} |`);
lines.push(`| **Failed** | ${data.numFailedTests} |`);
lines.push(`| **Pending** | ${data.numPendingTests} |`);
lines.push(`| **Overall** | ${data.success ? "✅ PASS" : "❌ FAIL"} |`);
lines.push(``);

for (const suite of data.testResults) {
  const relativePath = path.relative(process.cwd(), suite.name);
  const suiteStatus = suite.status === "passed" ? "✅" : "❌";
  lines.push(`## ${suiteStatus} ${relativePath}`);
  lines.push(``);
  lines.push(`| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |`);
  lines.push(`|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|`);

  for (const test of suite.assertionResults) {
    const isPassed = test.status === "passed";
    const statusIcon = isPassed ? "✅ PASS" : test.status === "failed" ? "❌ FAIL" : "⏭ SKIP";
    const title = sanitizeCell(test.title);
    const description = sanitizeCell(
      test.ancestorTitles.length > 0
        ? `${test.ancestorTitles.join(" › ")} › ${test.title}`
        : test.title,
    );
    const steps = sanitizeCell(
      test.ancestorTitles.length > 0
        ? test.ancestorTitles.map((t, i) => `${i + 1}. ${t}`).join("; ")
        : "1. Execute test",
    );
    const expected = sanitizeCell(deriveExpected(test.title));
    const actualResult = isPassed
      ? "As expected"
      : test.failureMessages.length > 0
      ? sanitizeCell((test.failureMessages[0]!.split("\n")[0] ?? "unknown error"))
      : "Failed";
    const errorDetails =
      test.failureMessages.length > 0
        ? sanitizeCell(test.failureMessages[0]!.slice(0, 150))
        : "—";
    const additionalNotes =
      test.duration != null ? `${test.duration}ms` : "—";

    lines.push(`| ${title} | ${description} | ${steps} | ${expected} | ${actualResult} | ${statusIcon} | ${errorDetails} | ${additionalNotes} |`);
  }

  lines.push(``);
}

const markdown = lines.join("\n");
fs.writeFileSync(reportMdPath, markdown, "utf-8");

console.log("\n========================================");
console.log("  Test Report Summary");
console.log("========================================");
console.log(`  Run date: ${runDate}`);
console.log(`  Duration: ${totalDurationSec}s`);
console.log(`  Total:    ${data.numTotalTests}`);
console.log(`  Passed:   ${data.numPassedTests}`);
console.log(`  Failed:   ${data.numFailedTests}`);
console.log(`  Pending:  ${data.numPendingTests}`);
console.log(`  Status:   ${data.success ? "✅ PASS" : "❌ FAIL"}`);
console.log("========================================");
console.log(`\nReport written to: ${reportMdPath}`);
