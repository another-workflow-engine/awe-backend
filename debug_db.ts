import { db } from "./src/database.js";
import { instanceService } from "./src/services/instance.service.js";

async function main() {
  const instances = await db
    .selectFrom("instance")
    .select(["id", "status", "current_node_id", "auto_advance", "control_signal"])
    .orderBy("created_on", "desc")
    .limit(3)
    .execute();

  console.log("Recent Instances:", instances);

  for (const inst of instances) {
    const tasks = await db
      .selectFrom("task")
      .select(["id", "status", "node_id"])
      .where("instance_id", "=", inst.id)
      .execute();
    console.log(`Tasks for instance ${inst.id}:`, tasks);

    const execs = await db
      .selectFrom("task_execution")
      .innerJoin("task", "task.id", "task_execution.task_id")
      .select(["task_execution.id", "task_execution.status", "task.status as task_status"])
      .where("task.instance_id", "=", inst.id)
      .execute();
    console.log(`Task executions for instance ${inst.id}:`, execs);
  }
}

main().then(() => process.exit(0)).catch(console.error);
