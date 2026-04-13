import { Queue } from "bullmq";
import { redisConnectionOptions } from "./src/config/redis.js";

async function main() {
  const queue = new Queue("ExecutionQueue", { connection: redisConnectionOptions });
  
  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const delayed = await queue.getDelayed();
  const failed = await queue.getFailed();

  console.log(`Waiting: ${waiting.length}`, waiting.map(j => ({ id: j.id, data: j.data, attempts: j.attemptsMade })));
  console.log(`Active: ${active.length}`, active.map(j => ({ id: j.id, data: j.data, attempts: j.attemptsMade })));
  console.log(`Delayed: ${delayed.length}`, delayed.map(j => ({ id: j.id, data: j.data, attempts: j.attemptsMade })));
  console.log(`Failed: ${failed.length}`, failed.map(j => ({ id: j.id, data: j.data, returnvalue: j.returnvalue, failedReason: j.failedReason })));

  await queue.close();
}

main().catch(console.error);
