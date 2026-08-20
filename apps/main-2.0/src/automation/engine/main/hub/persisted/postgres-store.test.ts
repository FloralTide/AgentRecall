import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresDatabase } from "../../../../../core/postgres/database";
import { POSTGRES_MIGRATIONS } from "../../../../../core/postgres/schema";
import { PGliteTestPool } from "../../../../../core/postgres/test-pglite";
import type { PersistedAppStateV5 } from "./agent-hub-persistence";
import { PostgresAppStore } from "./postgres-store";

async function insertWorkflow(
  database: PostgresDatabase,
  input: { id: string; nodeCount?: number; updatedAt: number; isTemplate?: boolean },
): Promise<void> {
  const definition = {
    id: input.id,
    name: input.id,
    description: "",
    inputs: [],
    nodes: Array.from({ length: input.nodeCount ?? 0 }, (_, index) => ({ id: `node-${index}` })),
    isTemplate: input.isTemplate,
    createdAt: input.updatedAt,
    updatedAt: input.updatedAt,
  };
  await database.query(
    `insert into agent_recall.workflows (id, name, description, definition, created_at, updated_at)
     values ($1, $2, '', $3::jsonb, $4, $4)`,
    [input.id, input.id, JSON.stringify(definition), new Date(input.updatedAt)],
  );
}

async function insertWorkflowRun(
  database: PostgresDatabase,
  input: {
    id: string;
    workflowId: string;
    status: string;
    startedAt: number;
    finishedAt?: number;
  },
): Promise<void> {
  await database.query(
    `insert into agent_recall.workflow_runs (
       id, workflow_id, definition, inputs, status, events, started_at, finished_at
     ) values ($1, $2, '{}'::jsonb, '{}'::jsonb, $3, '[]'::jsonb, $4, $5)`,
    [
      input.id,
      input.workflowId,
      input.status,
      new Date(input.startedAt),
      input.finishedAt === undefined ? null : new Date(input.finishedAt),
    ],
  );
}

describe("PostgreSQL AgentHub persistence", () => {
  let database: PostgresDatabase;
  let store: PostgresAppStore;

  beforeEach(async () => {
    database = new PostgresDatabase(new PGliteTestPool(), {
      migrationLock: false,
      migrations: POSTGRES_MIGRATIONS,
    });
    await database.initialize();
    store = new PostgresAppStore(database);
  });

  afterEach(async () => {
    await database.close();
  });

  it("persists chat runtime state without writing legacy Workflow state", async () => {
    const payload = {
      version: 5,
      activeChatId: "chat-1",
      workDir: "/workspace",
      sessions: [{
        id: "chat-1",
        title: "Fix search",
        configuredAgentId: "codex",
        runtimeState: { state: "idle" },
        runtimeConversation: {
          runtimeId: "codex",
          sessionId: "provider-session",
          codecVersion: "1",
          payload: {},
        },
        createdAt: 1_000,
        updatedAt: 2_000,
      }],
      messages: [{
        id: "message-1",
        chatId: "chat-1",
        role: "assistant",
        content: "Done",
        timestamp: 1_500,
      }],
      events: [{
        id: "event-1",
        chatId: "chat-1",
        messageId: "message-1",
        type: "meta",
        content: "completed",
        timestamp: 1_600,
      }],
      workflowStore: {
        activeWorkflowId: "workflow-1",
        workflows: [{
          workflowId: "workflow-1",
          title: "Review",
          status: "completed",
          revision: 1,
          configuredAgentId: "codex",
          modelId: "gpt",
          objective: "Review the change",
          messages: [{
            id: "workflow-message-1",
            role: "assistant",
            content: "Approval denied",
            events: [{
              id: "workflow-tool-1",
              type: "tool_result",
              name: "workflow_update",
              content: "denied",
              timestamp: 1_650,
              metadata: { status: "failed" },
            }],
          }],
          reply: "",
          runProgress: [{
            nodeId: "review",
            title: "Review",
            status: "completed",
            inputSummary: { objective: "Review the change" },
            outputs: { result: "approved" },
            telemetry: {
              provider: "openai",
              runtimeId: "codex",
              channelId: "channel-1",
              modelId: "gpt",
              attempt: 1,
              startedAt: 1_700,
              finishedAt: 1_900,
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              estimatedCost: 0.002,
            },
          }],
          runContextDocument: "",
          contextDocument: "",
          runIds: ["run-1"],
          createdAt: 1_000,
          updatedAt: 2_000,
        }],
        runs: [{
          runId: "run-1",
          workflowId: "workflow-1",
          status: "completed",
          triggerSource: "scheduled",
          configurationSnapshot: {
            configuredAgentId: "codex",
            runtimeId: "codex",
            channelId: "channel-1",
            modelId: "gpt",
            reasoningEffort: "high",
            agentRevision: 2,
          },
          progress: [{
            nodeId: "review",
            title: "Review",
            status: "completed",
            inputSummary: { objective: "Review the change" },
            outputs: { result: "approved" },
            telemetry: {
              provider: "openai",
              runtimeId: "codex",
              channelId: "channel-1",
              modelId: "gpt",
              attempt: 1,
              startedAt: 1_700,
              finishedAt: 1_900,
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              estimatedCost: 0.002,
            },
          }],
          events: [{
            type: "node_completed",
            nodeId: "review",
            at: 1_900,
            sequence: 0,
            summary: "Looks good",
            artifactRefs: [{
              kind: "text",
              title: "Review",
              content: "No blockers",
            }],
          }],
          contextDocument: "",
          startedAt: 1_700,
          finishedAt: 2_000,
        }],
      },
    } as unknown as PersistedAppStateV5;

    await store.save(payload);
    const sidebar = await store.loadWorkflowSidebar();
    const restored = await store.load() as Record<string, unknown>;

    expect(sidebar).toEqual({ workflows: [] });

    expect(restored).toMatchObject({
      version: 5,
      activeChatId: "chat-1",
      workDir: "/workspace",
      sessions: [{
        id: "chat-1",
        runtimeConversation: expect.objectContaining({
          sessionId: "provider-session",
        }),
      }],
      workflowStore: {
        workflows: [],
        runs: [],
      },
    });

    const counts = await database.query<{
      chats: number;
      workflows: number;
      runs: number;
    }>(`
      select
        (select count(*)::integer from agent_recall.automation_chats) as chats,
        (select count(*)::integer from agent_recall.workflows) as workflows,
        (select count(*)::integer from agent_recall.workflow_runs) as runs
    `);
    expect(counts.rows[0]).toEqual({
      chats: 1,
      workflows: 0,
      runs: 0,
    });
  });

  it("round-trips DeepSeek Harness channels and configured Agents in auxiliary state", async () => {
    const payload = {
      version: 5,
      activeChatId: null,
      workDir: "/workspace",
      channels: [{
        id: "dsh-default",
        agentId: "dsh",
        label: "DeepSeek Harness",
        presetId: "dsh-default",
        models: [{ id: "default", label: "Default" }],
      }],
      configuredAgents: [{
        id: "dsh-agent",
        name: "DSH Agent",
        description: "",
        runtimeAgentId: "dsh",
        channelId: "dsh-default",
        modelId: "default",
        tags: [],
        createdAt: 1,
        updatedAt: 2,
      }],
      sessions: [],
      messages: [],
      events: [],
      workflowStore: {
        activeWorkflowId: undefined,
        workflows: [],
        runs: [],
      },
    } as unknown as PersistedAppStateV5;

    await store.save(payload);

    await expect(store.load()).resolves.toMatchObject({
      channels: [{
        id: "dsh-default",
        agentId: "dsh",
        models: [{ id: "default" }],
      }],
      configuredAgents: [{
        id: "dsh-agent",
        runtimeAgentId: "dsh",
        channelId: "dsh-default",
        modelId: "default",
      }],
    });
  });

  it("loads a bounded personal Workflow Core summary with active runs prioritized", async () => {
    await insertWorkflow(database, {
      id: "template",
      nodeCount: 7,
      updatedAt: 10_000,
      isTemplate: true,
    });
    await insertWorkflow(database, { id: "waiting", nodeCount: 1, updatedAt: 1_000 });
    await insertWorkflow(database, {
      id: "running",
      nodeCount: 2,
      updatedAt: 1_100,
      isTemplate: false,
    });
    await insertWorkflow(database, { id: "failed", nodeCount: 3, updatedAt: 5_000 });
    await insertWorkflow(database, { id: "draft", nodeCount: 4, updatedAt: 2_400 });
    await insertWorkflow(database, { id: "paused", nodeCount: 5, updatedAt: 1_200 });
    await insertWorkflow(database, { id: "completed", nodeCount: 6, updatedAt: 1_300 });
    await insertWorkflowRun(database, {
      id: "run-template",
      workflowId: "template",
      status: "waiting",
      startedAt: 11_000,
    });
    await insertWorkflowRun(database, {
      id: "run-waiting",
      workflowId: "waiting",
      status: "waiting",
      startedAt: 2_000,
    });
    await insertWorkflowRun(database, {
      id: "run-running",
      workflowId: "running",
      status: "running",
      startedAt: 2_100,
    });
    await insertWorkflowRun(database, {
      id: "run-failed",
      workflowId: "failed",
      status: "failed",
      startedAt: 2_200,
      finishedAt: 2_300,
    });
    await insertWorkflowRun(database, {
      id: "run-paused",
      workflowId: "paused",
      status: "paused",
      startedAt: 2_500,
    });
    await insertWorkflowRun(database, {
      id: "run-paused-newer-completed",
      workflowId: "paused",
      status: "completed",
      startedAt: 3_000,
      finishedAt: 3_100,
    });
    await insertWorkflowRun(database, {
      id: "run-completed",
      workflowId: "completed",
      status: "completed",
      startedAt: 3_200,
      finishedAt: 3_300,
    });
    const query = vi.spyOn(database, "query");

    const summary = await store.loadWorkflowWorkbench();

    expect(summary).toEqual({
      workflows: [
        {
          workflow: { workflowId: "waiting", title: "waiting" },
          nodeCount: 1,
          status: "waiting_for_user",
          updatedAt: 2_000,
        },
        {
          workflow: { workflowId: "running", title: "running" },
          nodeCount: 2,
          status: "running",
          updatedAt: 2_100,
        },
        {
          workflow: { workflowId: "failed", title: "failed" },
          nodeCount: 3,
          status: "failed",
          updatedAt: 5_000,
        },
        {
          workflow: { workflowId: "draft", title: "draft" },
          nodeCount: 4,
          status: "draft",
          updatedAt: 2_400,
        },
        {
          workflow: { workflowId: "paused", title: "paused" },
          nodeCount: 5,
          status: "stopped",
          updatedAt: 2_500,
        },
      ],
      totalCount: 6,
      activeCount: 2,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0]!;
    expect(sql).toContain("LIMIT $1");
    expect(sql).not.toContain("workflow_node_runs");
    expect(parameters).toEqual([5]);
  });

  it("maps cancelled and completed Workflow Core runs without loading node runs", async () => {
    await insertWorkflow(database, { id: "cancelled", updatedAt: 1_000 });
    await insertWorkflow(database, { id: "completed", updatedAt: 1_100 });
    await insertWorkflowRun(database, {
      id: "run-cancelled",
      workflowId: "cancelled",
      status: "cancelled",
      startedAt: 2_000,
      finishedAt: 2_100,
    });
    await insertWorkflowRun(database, {
      id: "run-completed",
      workflowId: "completed",
      status: "completed",
      startedAt: 2_200,
      finishedAt: 2_300,
    });

    await expect(store.loadWorkflowWorkbench()).resolves.toMatchObject({
      workflows: [
        {
          workflow: { workflowId: "cancelled" },
          status: "stopped",
          updatedAt: 2_100,
        },
        {
          workflow: { workflowId: "completed" },
          status: "completed",
          updatedAt: 2_300,
        },
      ],
      totalCount: 2,
      activeCount: 0,
    });
  });
});
