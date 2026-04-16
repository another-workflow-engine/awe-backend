import { Project } from "ts-morph";
import * as fs from "fs";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const sourceFile = project.getSourceFileOrThrow("src/types/database.ts");

const EXCLUDE = ["DB"];

const interfaces = sourceFile
  .getInterfaces()
  .filter((i) => !EXCLUDE.includes(i.getName()));

const names = interfaces.map((i) => i.getName());
const importLine = `import type { ${names.join(", ")} } from "./database.js";`;

const output: string[] = [importLine, ""];

for (const iface of interfaces) {
  const name = iface.getName();
  const columns = iface.getProperties().map((p) => p.getName());

  output.push(
    `export const ${name.charAt(0).toLowerCase() + name.slice(1)}Columns = ${JSON.stringify(columns)} as const satisfies (keyof ${name})[];`,
  );
}

fs.writeFileSync("src/types/columnNames.ts", output.join("\n\n"));

console.log("Generated column name arrays");