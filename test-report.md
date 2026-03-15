# Test Report

| | |
|---|---|
| **Run date** | 2026-03-15T07:38:00.643Z |
| **Duration** | 27.16s |
| **Total** | 120 |
| **Passed** | 120 |
| **Failed** | 0 |
| **Pending** | 0 |
| **Overall** | ✅ PASS |

## ✅ tests\services\instance.service.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| inserts instance, enqueues start node job, and returns instance | instanceService › createNew() › inserts instance, enqueues start node job, and returns instance | 1. instanceService; 2. createNew() | instance | As expected | ✅ PASS | — | 11ms |
| throws NotFoundError when no active workflow version exists | instanceService › createNew() › throws NotFoundError when no active workflow version exists | 1. instanceService; 2. createNew() | throws NotFoundError when no active workflow version exists | As expected | ✅ PASS | — | 48ms |
| enqueues job with the start node ID from the workflow version | instanceService › createNew() › enqueues job with the start node ID from the workflow version | 1. instanceService; 2. createNew() | job enqueued | As expected | ✅ PASS | — | 2ms |
| returns instance when found | instanceService › getById() › returns instance when found | 1. instanceService; 2. getById() | instance | As expected | ✅ PASS | — | 1ms |
| returns undefined when not found | instanceService › getById() › returns undefined when not found | 1. instanceService; 2. getById() | undefined | As expected | ✅ PASS | — | 2ms |
| throws NotFoundError when instance does not exist | instanceService › resumeInstance() › throws NotFoundError when instance does not exist | 1. instanceService; 2. resumeInstance() | throws NotFoundError when instance does not exist | As expected | ✅ PASS | — | 2ms |
| throws StateTransitionError when instance is not paused | instanceService › resumeInstance() › throws StateTransitionError when instance is not paused | 1. instanceService; 2. resumeInstance() | throws StateTransitionError when instance is not paused | As expected | ✅ PASS | — | 2ms |
| throws DataIntegrityError when no completed task found | instanceService › resumeInstance() › throws DataIntegrityError when no completed task found | 1. instanceService; 2. resumeInstance() | throws DataIntegrityError when no completed task found | As expected | ✅ PASS | — | 2ms |
| enqueues next nodes and updates instance to IN_PROGRESS for paused instance | instanceService › resumeInstance() › enqueues next nodes and updates instance to IN_PROGRESS for paused instance | 1. instanceService; 2. resumeInstance() | job enqueued | As expected | ✅ PASS | — | 8ms |
| enqueues multiple next nodes when edge resolver returns multiple IDs | instanceService › resumeInstance() › enqueues multiple next nodes when edge resolver returns multiple IDs | 1. instanceService; 2. resumeInstance() | multiple IDs | As expected | ✅ PASS | — | 1ms |

## ✅ tests\controllers\instance.controller.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| returns 201 with created instance | instanceController › create() › returns 201 with created instance | 1. instanceController; 2. create() | 201 with created instance | As expected | ✅ PASS | — | 34ms |
| throws ZodError when workflowId is not a UUID | instanceController › create() › throws ZodError when workflowId is not a UUID | 1. instanceController; 2. create() | throws ZodError when workflowId is not a UUID | As expected | ✅ PASS | — | 26ms |
| propagates NotFoundError when no active workflow version found | instanceController › create() › propagates NotFoundError when no active workflow version found | 1. instanceController; 2. create() | error propagated | As expected | ✅ PASS | — | 3ms |
| returns instance when found | instanceController › getById() › returns instance when found | 1. instanceController; 2. getById() | instance | As expected | ✅ PASS | — | 2ms |
| throws NotFoundError when instance not found | instanceController › getById() › throws NotFoundError when instance not found | 1. instanceController; 2. getById() | throws NotFoundError when instance not found | As expected | ✅ PASS | — | 1ms |
| throws ZodError when instanceId is not a valid UUID | instanceController › getById() › throws ZodError when instanceId is not a valid UUID | 1. instanceController; 2. getById() | throws ZodError when instanceId is not a valid UUID | As expected | ✅ PASS | — | 2ms |
| returns updated instance when resume succeeds | instanceController › resumeInstance() › returns updated instance when resume succeeds | 1. instanceController; 2. resumeInstance() | updated instance | As expected | ✅ PASS | — | 4ms |
| throws ZodError when instanceId is not a valid UUID | instanceController › resumeInstance() › throws ZodError when instanceId is not a valid UUID | 1. instanceController; 2. resumeInstance() | throws ZodError when instanceId is not a valid UUID | As expected | ✅ PASS | — | 2ms |
| propagates StateTransitionError when instance is not paused | instanceController › resumeInstance() › propagates StateTransitionError when instance is not paused | 1. instanceController; 2. resumeInstance() | error propagated | As expected | ✅ PASS | — | 2ms |
| propagates NotFoundError when instance does not exist | instanceController › resumeInstance() › propagates NotFoundError when instance does not exist | 1. instanceController; 2. resumeInstance() | error propagated | As expected | ✅ PASS | — | 3ms |

## ✅ tests\services\userTask.service.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| throws NotFoundError when task does not exist | resumeUserTask › throws NotFoundError when task does not exist | 1. resumeUserTask | throws NotFoundError when task does not exist | As expected | ✅ PASS | — | 49ms |
| throws StateTransitionError when task status is not IN_PROGRESS | resumeUserTask › throws StateTransitionError when task status is not IN_PROGRESS | 1. resumeUserTask | throws StateTransitionError when task status is not IN_PROGRESS | As expected | ✅ PASS | — | 2ms |
| throws DataIntegrityError when instance is not found | resumeUserTask › throws DataIntegrityError when instance is not found | 1. resumeUserTask | throws DataIntegrityError when instance is not found | As expected | ✅ PASS | — | 3ms |
| throws StateTransitionError when instance is not PAUSED | resumeUserTask › throws StateTransitionError when instance is not PAUSED | 1. resumeUserTask | throws StateTransitionError when instance is not PAUSED | As expected | ✅ PASS | — | 8ms |
| enqueues next nodes on successful user input submission | resumeUserTask › enqueues next nodes on successful user input submission | 1. resumeUserTask | job enqueued | As expected | ✅ PASS | — | 6ms |
| maps userInput fields to context variables via responseMap | resumeUserTask › maps userInput fields to context variables via responseMap | 1. resumeUserTask | — | As expected | ✅ PASS | — | 2ms |
| updates task to COMPLETED and instance to IN_PROGRESS after user input | resumeUserTask › updates task to COMPLETED and instance to IN_PROGRESS after user input | 1. resumeUserTask | — | As expected | ✅ PASS | — | 2ms |

## ✅ tests\engine\executors\UserTaskExecutor.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| returns IN_PROGRESS to signal the node is awaiting user input | UserTaskExecutor › returns IN_PROGRESS to signal the node is awaiting user input | 1. UserTaskExecutor | IN_PROGRESS to signal the node is awaiting user input | As expected | ✅ PASS | — | 4ms |
| evaluates requestMap FEEL expressions and stores results in requestData | UserTaskExecutor › evaluates requestMap FEEL expressions and stores results in requestData | 1. UserTaskExecutor | — | As expected | ✅ PASS | — | 17ms |
| includes responseMap in outputVariables for UI form rendering | UserTaskExecutor › includes responseMap in outputVariables for UI form rendering | 1. UserTaskExecutor | — | As expected | ✅ PASS | — | 2ms |
| returns empty requestData when requestMap is empty | UserTaskExecutor › returns empty requestData when requestMap is empty | 1. UserTaskExecutor | empty requestData | As expected | ✅ PASS | — | 1ms |
| throws DataIntegrityError when node configuration is invalid | UserTaskExecutor › throws DataIntegrityError when node configuration is invalid | 1. UserTaskExecutor | throws DataIntegrityError when node configuration is invalid | As expected | ✅ PASS | — | 18ms |

## ✅ tests\services\apiKey.service.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should return api keys | ApiKey Service › should return api keys | 1. ApiKey Service | api keys | As expected | ✅ PASS | — | 4ms |
| should throw error if actor is not organization | ApiKey Service › should throw error if actor is not organization | 1. ApiKey Service | throws error if actor is not organization | As expected | ✅ PASS | — | 14ms |
| should throw error if environment missing | ApiKey Service › should throw error if environment missing | 1. ApiKey Service | throws error if environment missing | As expected | ✅ PASS | — | 2ms |

## ✅ tests\controllers\task.controller.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| calls res.json with the task when a valid UUID is provided and task is found | taskController › getTask() › calls res.json with the task when a valid UUID is provided and task is found | 1. taskController; 2. getTask() | res.json with the task when a valid UUID is provided and task is found called | As expected | ✅ PASS | — | 7ms |
| throws NotFoundError when task is not found | taskController › getTask() › throws NotFoundError when task is not found | 1. taskController; 2. getTask() | throws NotFoundError when task is not found | As expected | ✅ PASS | — | 11ms |
| throws ZodError when taskId is not a valid UUID | taskController › getTask() › throws ZodError when taskId is not a valid UUID | 1. taskController; 2. getTask() | throws ZodError when taskId is not a valid UUID | As expected | ✅ PASS | — | 7ms |
| throws ZodError when taskId param is missing | taskController › getTask() › throws ZodError when taskId param is missing | 1. taskController; 2. getTask() | throws ZodError when taskId param is missing | As expected | ✅ PASS | — | 2ms |
| propagates RepositoryError thrown by the service | taskController › getTask() › propagates RepositoryError thrown by the service | 1. taskController; 2. getTask() | error propagated | As expected | ✅ PASS | — | 1ms |

## ✅ tests\engine\queue\BullMQWorker.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| registers a 'failed' event listener on the worker | ExecutionWorker › constructor › registers a 'failed' event listener on the worker | 1. ExecutionWorker; 2. constructor | — | As expected | ✅ PASS | — | 9ms |
| passes concurrency: 10 to the BullMQ Worker | ExecutionWorker › constructor › passes concurrency: 10 to the BullMQ Worker | 1. ExecutionWorker; 2. constructor | — | As expected | ✅ PASS | — | 12ms |
| skips processing when instance is not found | ExecutionWorker › processJob() › skips processing when instance is not found | 1. ExecutionWorker; 2. processJob() | processing skipped | As expected | ✅ PASS | — | 6ms |
| skips processing when instance status is not in_progress | ExecutionWorker › processJob() › skips processing when instance status is not in_progress | 1. ExecutionWorker; 2. processJob() | processing skipped | As expected | ✅ PASS | — | 1ms |
| calls executionEngine.runNode with correct args when instance is in_progress | ExecutionWorker › processJob() › calls executionEngine.runNode with correct args when instance is in_progress | 1. ExecutionWorker; 2. processJob() | executionEngine.runNode with correct args when instance is in_progress called | As expected | ✅ PASS | — | 1ms |
| enqueues next nodes when outcome is 'next' and auto_advance is true | ExecutionWorker › processJob() › enqueues next nodes when outcome is 'next' and auto_advance is true | 1. ExecutionWorker; 2. processJob() | job enqueued | As expected | ✅ PASS | — | 4ms |
| marks instance as PAUSED when outcome is 'next' and auto_advance is false | ExecutionWorker › processJob() › marks instance as PAUSED when outcome is 'next' and auto_advance is false | 1. ExecutionWorker; 2. processJob() | status updated | As expected | ✅ PASS | — | 3ms |
| does not enqueue or update instance when outcome is 'user_task' | ExecutionWorker › processJob() › does not enqueue or update instance when outcome is 'user_task' | 1. ExecutionWorker; 2. processJob() | job enqueued | As expected | ✅ PASS | — | 5ms |
| does not enqueue next nodes when outcome is 'completed' | ExecutionWorker › processJob() › does not enqueue next nodes when outcome is 'completed' | 1. ExecutionWorker; 2. processJob() | job enqueued | As expected | ✅ PASS | — | 1ms |
| does not enqueue next nodes when outcome is 'failed' | ExecutionWorker › processJob() › does not enqueue next nodes when outcome is 'failed' | 1. ExecutionWorker; 2. processJob() | job enqueued | As expected | ✅ PASS | — | 1ms |
| calls worker.close() | ExecutionWorker › close() › calls worker.close() | 1. ExecutionWorker; 2. close() | worker.close() called | As expected | ✅ PASS | — | 1ms |

## ✅ tests\engine\executors\EndNodeExecutor.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| evaluates resultMap FEEL expressions and returns COMPLETED with correct outputVariables | EndNodeExecutor › evaluates resultMap FEEL expressions and returns COMPLETED with correct outputVariables | 1. EndNodeExecutor | COMPLETED with correct outputVariables | As expected | ✅ PASS | — | 25ms |
| returns FAILED when configuration.success is false even when FEEL evaluation succeeds | EndNodeExecutor › returns FAILED when configuration.success is false even when FEEL evaluation succeeds | 1. EndNodeExecutor | FAILED | As expected | ✅ PASS | — | 1ms |
| returns FAILED when FEEL expression produces evaluation warnings | EndNodeExecutor › returns FAILED when FEEL expression produces evaluation warnings | 1. EndNodeExecutor | FAILED | As expected | ✅ PASS | — | 3ms |
| returns COMPLETED when validationExpression evaluates to true | EndNodeExecutor › returns COMPLETED when validationExpression evaluates to true | 1. EndNodeExecutor | COMPLETED | As expected | ✅ PASS | — | 6ms |
| returns FAILED when validationExpression evaluates to false | EndNodeExecutor › returns FAILED when validationExpression evaluates to false | 1. EndNodeExecutor | FAILED | As expected | ✅ PASS | — | 2ms |
| returns COMPLETED with empty outputVariables when resultMap is empty | EndNodeExecutor › returns COMPLETED with empty outputVariables when resultMap is empty | 1. EndNodeExecutor | COMPLETED with empty outputVariables | As expected | ✅ PASS | — | 1ms |
| throws DataIntegrityError when node configuration is invalid | EndNodeExecutor › throws DataIntegrityError when node configuration is invalid | 1. EndNodeExecutor | throws DataIntegrityError when node configuration is invalid | As expected | ✅ PASS | — | 34ms |
| includes message in outputVariables when end node has a message configured | EndNodeExecutor › includes message in outputVariables when end node has a message configured | 1. EndNodeExecutor | — | As expected | ✅ PASS | — | 7ms |

## ✅ tests\services\auth.service.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should login successfully | Auth Service › should login successfully | 1. Auth Service | — | As expected | ✅ PASS | — | 10ms |
| should throw error if password incorrect | Auth Service › should throw error if password incorrect | 1. Auth Service | throws error if password incorrect | As expected | ✅ PASS | — | 17ms |
| should throw error if user not found | Auth Service › should throw error if user not found | 1. Auth Service | throws error if user not found | As expected | ✅ PASS | — | 1ms |
| should generate new tokens using refresh token | Auth Service › should generate new tokens using refresh token | 1. Auth Service | — | As expected | ✅ PASS | — | 4ms |

## ✅ tests\middlewares\auth.middleware.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should authenticate bearer token | Auth Middleware › should authenticate bearer token | 1. Auth Middleware | — | As expected | ✅ PASS | — | 3ms |
| should throw error if authorization header missing | Auth Middleware › should throw error if authorization header missing | 1. Auth Middleware | throws error if authorization header missing | As expected | ✅ PASS | — | 44ms |
| should authenticate api key | Auth Middleware › should authenticate api key | 1. Auth Middleware | — | As expected | ✅ PASS | — | 1ms |
| should throw error for invalid authorization format | Auth Middleware › should throw error for invalid authorization format | 1. Auth Middleware | throws error for invalid authorization format | As expected | ✅ PASS | — | 8ms |

## ✅ tests\engine\executors\StartNodeExecutor.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| maps constants correctly from instanceInputVariables | StartNodeExecutor › maps constants correctly from instanceInputVariables | 1. StartNodeExecutor | — | As expected | ✅ PASS | — | 5ms |
| fetches data from URL and stores extracted value in constants when fetchableId is present | StartNodeExecutor › fetches data from URL and stores extracted value in constants when fetchableId is present | 1. StartNodeExecutor | — | As expected | ✅ PASS | — | 15ms |
| deduplicates fetch calls when multiple inputDataMap entries reference the same fetchableId | StartNodeExecutor › deduplicates fetch calls when multiple inputDataMap entries reference the same fetchableId | 1. StartNodeExecutor | when multiple inputDataMap entries reference the same fetchableId called | As expected | ✅ PASS | — | 2ms |
| evaluates FEEL urlExpression and stores the result in urls keyed by fetchable id | StartNodeExecutor › evaluates FEEL urlExpression and stores the result in urls keyed by fetchable id | 1. StartNodeExecutor | — | As expected | ✅ PASS | — | 2ms |
| returns COMPLETED with empty maps when inputDataMap and fetchables are empty | StartNodeExecutor › returns COMPLETED with empty maps when inputDataMap and fetchables are empty | 1. StartNodeExecutor | COMPLETED with empty maps | As expected | ✅ PASS | — | 1ms |
| throws DataIntegrityError when node configuration is invalid | StartNodeExecutor › throws DataIntegrityError when node configuration is invalid | 1. StartNodeExecutor | throws DataIntegrityError when node configuration is invalid | As expected | ✅ PASS | — | 46ms |
| throws DataIntegrityError when FEEL URL expression evaluates to a non-string | StartNodeExecutor › throws DataIntegrityError when FEEL URL expression evaluates to a non-string | 1. StartNodeExecutor | throws DataIntegrityError when FEEL URL expression evaluates to a non-string | As expected | ✅ PASS | — | 3ms |
| ignores _context and _transaction params and still returns COMPLETED | StartNodeExecutor › ignores _context and _transaction params and still returns COMPLETED | 1. StartNodeExecutor | COMPLETED | As expected | ✅ PASS | — | 1ms |

## ✅ tests\engine\ExecutionEngine.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| start node COMPLETED → outcome 'next' with nextNodeIds | ExecutionEngine › runNode() › start node COMPLETED → outcome 'next' with nextNodeIds | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 6ms |
| end node COMPLETED → outcome 'completed', instance status completed | ExecutionEngine › runNode() › end node COMPLETED → outcome 'completed', instance status completed | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 0ms |
| executor returns FAILED → outcome 'failed', instanceRepository.updateById called with FAILED | ExecutionEngine › runNode() › executor returns FAILED → outcome 'failed', instanceRepository.updateById called with FAILED | 1. ExecutionEngine; 2. runNode() | FAILED → outcome 'failed', instanceRepository.updateById called with FAILED | As expected | ✅ PASS | — | 3ms |
| executor throws → treated as FAILED, outcome 'failed' | ExecutionEngine › runNode() › executor throws → treated as FAILED, outcome 'failed' | 1. ExecutionEngine; 2. runNode() | throws → treated as FAILED, outcome 'failed' | As expected | ✅ PASS | — | 2ms |
| nodeId not found in workflow version → throws DataIntegrityError | ExecutionEngine › runNode() › nodeId not found in workflow version → throws DataIntegrityError | 1. ExecutionEngine; 2. runNode() | throws DataIntegrityError | As expected | ✅ PASS | — | 20ms |
| node type has no registered executor → throws StateTransitionError | ExecutionEngine › runNode() › node type has no registered executor → throws StateTransitionError | 1. ExecutionEngine; 2. runNode() | throws StateTransitionError | As expected | ✅ PASS | — | 1ms |
| user task node returns IN_PROGRESS → outcome 'user_task', instance set to PAUSED | ExecutionEngine › runNode() › user task node returns IN_PROGRESS → outcome 'user_task', instance set to PAUSED | 1. ExecutionEngine; 2. runNode() | IN_PROGRESS → outcome 'user_task', instance set to PAUSED | As expected | ✅ PASS | — | 2ms |
| no outgoing edges → outcome 'failed' | ExecutionEngine › runNode() › no outgoing edges → outcome 'failed' | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 1ms |
| end node FAILED → outcome 'failed' | ExecutionEngine › runNode() › end node FAILED → outcome 'failed' | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 1ms |
| edgeResolver throws StateTransitionError → outcome 'failed' | ExecutionEngine › runNode() › edgeResolver throws StateTransitionError → outcome 'failed' | 1. ExecutionEngine; 2. runNode() | throws StateTransitionError → outcome 'failed' | As expected | ✅ PASS | — | 1ms |
| taskRepository.insert is called once per runNode call | ExecutionEngine › runNode() › taskRepository.insert is called once per runNode call | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 1ms |
| taskExecutionRepository.insert is called once per runNode call | ExecutionEngine › runNode() › taskExecutionRepository.insert is called once per runNode call | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 1ms |
| constants from start node output are merged into context returned in 'next' outcome | ExecutionEngine › runNode() › constants from start node output are merged into context returned in 'next' outcome | 1. ExecutionEngine; 2. runNode() | — | As expected | ✅ PASS | — | 5ms |

## ✅ tests\controllers\auth.controller.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should login successfully | Auth Controller › should login successfully | 1. Auth Controller | — | As expected | ✅ PASS | — | 40ms |

## ✅ tests\services\task.service.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| returns the task when repository resolves with a task | taskService › getTask() › returns the task when repository resolves with a task | 1. taskService; 2. getTask() | the task | As expected | ✅ PASS | — | 5ms |
| returns undefined when repository resolves with undefined | taskService › getTask() › returns undefined when repository resolves with undefined | 1. taskService; 2. getTask() | undefined | As expected | ✅ PASS | — | 2ms |
| propagates RepositoryError thrown by the repository | taskService › getTask() › propagates RepositoryError thrown by the repository | 1. taskService; 2. getTask() | error propagated | As expected | ✅ PASS | — | 11ms |

## ✅ tests\controllers\system.controller.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should register system | System Controller › should register system | 1. System Controller | — | As expected | ✅ PASS | — | 64ms |

## ✅ tests\engine\queue\BullMQQueue.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| calls queue.add() with the job data and correct options | BullMQQueue › enqueue() › calls queue.add() with the job data and correct options | 1. BullMQQueue; 2. enqueue() | queue.add() with the job data and correct options called | As expected | ✅ PASS | — | 15ms |
| sets jobId to instanceId-nodeId for deduplication | BullMQQueue › enqueue() › sets jobId to instanceId-nodeId for deduplication | 1. BullMQQueue; 2. enqueue() | — | As expected | ✅ PASS | — | 1ms |
| sets attempts: 3 and exponential backoff | BullMQQueue › enqueue() › sets attempts: 3 and exponential backoff | 1. BullMQQueue; 2. enqueue() | — | As expected | ✅ PASS | — | 1ms |
| uses the EXECUTION_QUEUE_NAME constant as the queue name | BullMQQueue › enqueue() › uses the EXECUTION_QUEUE_NAME constant as the queue name | 1. BullMQQueue; 2. enqueue() | — | As expected | ✅ PASS | — | 1ms |
| calls queue.close() | BullMQQueue › close() › calls queue.close() | 1. BullMQQueue; 2. close() | queue.close() called | As expected | ✅ PASS | — | 2ms |

## ✅ tests\controllers\apiKey.controller.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| should list api keys | API Key Controller › should list api keys | 1. API Key Controller | — | As expected | ✅ PASS | — | 4ms |
| should generate new api key | API Key Controller › should generate new api key | 1. API Key Controller | — | As expected | ✅ PASS | — | 4ms |

## ✅ tests\engine\EdgeResolver.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| returns the destination id for a single outgoing edge | EdgeResolver › non-decision nodes › returns the destination id for a single outgoing edge | 1. EdgeResolver; 2. non-decision nodes | the destination id for a single outgoing edge | As expected | ✅ PASS | — | 4ms |
| returns all destination ids for multiple outgoing edges | EdgeResolver › non-decision nodes › returns all destination ids for multiple outgoing edges | 1. EdgeResolver; 2. non-decision nodes | all destination ids for multiple outgoing edges | As expected | ✅ PASS | — | 1ms |
| returns empty array when there are no outgoing edges | EdgeResolver › non-decision nodes › returns empty array when there are no outgoing edges | 1. EdgeResolver; 2. non-decision nodes | empty array | As expected | ✅ PASS | — | 1ms |
| excludes edges with null destination_node_id | EdgeResolver › non-decision nodes › excludes edges with null destination_node_id | 1. EdgeResolver; 2. non-decision nodes | — | As expected | ✅ PASS | — | 1ms |
| treats completedNodeId not found in nodes as a non-decision node | EdgeResolver › non-decision nodes › treats completedNodeId not found in nodes as a non-decision node | 1. EdgeResolver; 2. non-decision nodes | — | As expected | ✅ PASS | — | 1ms |
| returns destination of matching conditional edge | EdgeResolver › decision nodes › returns destination of matching conditional edge | 1. EdgeResolver; 2. decision nodes | destination of matching conditional edge | As expected | ✅ PASS | — | 13ms |
| falls back to default edge when no condition matches | EdgeResolver › decision nodes › falls back to default edge when no condition matches | 1. EdgeResolver; 2. decision nodes | — | As expected | ✅ PASS | — | 7ms |
| throws StateTransitionError when no condition matches and no default edge | EdgeResolver › decision nodes › throws StateTransitionError when no condition matches and no default edge | 1. EdgeResolver; 2. decision nodes | throws StateTransitionError when no condition matches and no default edge | As expected | ✅ PASS | — | 75ms |
| returns all destinations when multiple conditions match | EdgeResolver › decision nodes › returns all destinations when multiple conditions match | 1. EdgeResolver; 2. decision nodes | all destinations | As expected | ✅ PASS | — | 2ms |

## ✅ tests\engine\ContextManager.test.ts

| Test Case | Description | Steps | Expected Result | Actual Result | Status | Error Details | Additional Notes |
|-----------|-------------|-------|-----------------|---------------|--------|---------------|-----------------|
| returns empty global and next scopes | ContextManager › create() › returns empty global and next scopes | 1. ContextManager; 2. create() | empty global and next scopes | As expected | ✅ PASS | — | 4ms |
| merges into GLOBAL scope and leaves next untouched | ContextManager › merge() › merges into GLOBAL scope and leaves next untouched | 1. ContextManager; 2. merge() | — | As expected | ✅ PASS | — | 0ms |
| merges into NEXT scope and leaves global untouched | ContextManager › merge() › merges into NEXT scope and leaves global untouched | 1. ContextManager; 2. merge() | — | As expected | ✅ PASS | — | 0ms |
| does not mutate the original context object | ContextManager › merge() › does not mutate the original context object | 1. ContextManager; 2. merge() | — | As expected | ✅ PASS | — | 1ms |
| flattens global and next into one object | ContextManager › resolveForNode() › flattens global and next into one object | 1. ContextManager; 2. resolveForNode() | — | As expected | ✅ PASS | — | 1ms |
| next scope values shadow global scope values for the same key | ContextManager › resolveForNode() › next scope values shadow global scope values for the same key | 1. ContextManager; 2. resolveForNode() | — | As expected | ✅ PASS | — | 0ms |
| empties next and preserves global | ContextManager › clearNextScope() › empties next and preserves global | 1. ContextManager; 2. clearNextScope() | — | As expected | ✅ PASS | — | 64ms |
| does not mutate the original context | ContextManager › clearNextScope() › does not mutate the original context | 1. ContextManager; 2. clearNextScope() | — | As expected | ✅ PASS | — | 1ms |
| returns correct WorkflowContext from well-formed JSON | ContextManager › fromJson() › returns correct WorkflowContext from well-formed JSON | 1. ContextManager; 2. fromJson() | correct WorkflowContext from well-formed JSON | As expected | ✅ PASS | — | 1ms |
| returns empty scopes when input is null | ContextManager › fromJson() › returns empty scopes when input is null | 1. ContextManager; 2. fromJson() | empty scopes | As expected | ✅ PASS | — | 1ms |
| defaults global to empty object when key is missing | ContextManager › fromJson() › defaults global to empty object when key is missing | 1. ContextManager; 2. fromJson() | — | As expected | ✅ PASS | — | 3ms |
