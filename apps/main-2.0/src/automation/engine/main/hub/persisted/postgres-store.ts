import { asRecord, asString } from "./persisted-values";
import type { PostgresDatabase, PostgresQueryable } from "../../../../../core/postgres/database";
import type { PersistedAppStateV5 } from "./agent-hub-persistence";
import type { WorkflowSidebarItem } from "../../../shared/types";
import type {
  WorkflowWorkbenchSnapshot,
  WorkflowWorkbenchItem,
} from "../../../../../shared/ipc/automation";
import type { AgentHubPersistedStore } from "./persisted-store";
import { PostgresChatRepository } from "./postgres-chat-repository";
import { jsonParameter, postgresRecord, postgresTime } from "./postgres-values";

const AUX_STATE_ID = 1;
const WORKFLOW_WORKBENCH_LIMIT = 5;

export class PostgresAppStore implements AgentHubPersistedStore {
  readonly label = "PostgreSQL";
  private readonly chats = new PostgresChatRepository();

  constructor(
    private readonly database: PostgresDatabase,
    readonly fileStoragePath?: string,
  ) {}

  async load(): Promise<unknown | undefined> {
    const [auxResult, countResult, settingsResult] = await Promise.all([
      this.database.query<{ payload: unknown }>(
        "select payload from agent_recall.app_aux_state where id = $1",
        [AUX_STATE_ID],
      ),
      this.database.query<{
        chat_count: number;
        workflow_count: number;
      }>(`
        select
          (select count(*)::integer from agent_recall.automation_chats) as chat_count,
          (select count(*)::integer from agent_recall.workflows) as workflow_count
      `),
      this.database.query<{ key: string; value_text: string | null }>(
        "select key, value_text from agent_recall.app_settings",
      ),
    ]);
    const aux = auxResult.rows[0]?.payload;
    const counts = countResult.rows[0];
    if (
      aux === undefined &&
      Number(counts?.chat_count ?? 0) === 0 &&
      Number(counts?.workflow_count ?? 0) === 0
    ) {
      return undefined;
    }

    const settings = new Map(
      settingsResult.rows.map((row) => [row.key, row.value_text] as const),
    );
    const payload = postgresRecord(aux);
    payload.version = Number(settings.get("payload_version") ?? "5");
    payload.activeChatId = settings.get("active_chat_id") ?? null;
    payload.workDir = settings.get("work_dir") ?? "";
    Object.assign(payload, await this.chats.load(this.database));
    payload.workflowStore = { activeWorkflowId: undefined, workflows: [], runs: [] };
    return payload;
  }

  async loadWorkflowSidebar(): Promise<{
    activeWorkflowId?: string;
    workflows: WorkflowSidebarItem[];
  }> {
    const result = await this.database.query<{
      id: string;
      name: string;
      description: string;
      definition: { nodes?: unknown[] };
      created_at: unknown;
      updated_at: unknown;
    }>("select id, name, description, definition, created_at, updated_at from agent_recall.workflows order by created_at desc, id");
    const workflows: WorkflowSidebarItem[] = result.rows.map((row) => ({
      workflowId: row.id,
      sourceType: "user",
      title: row.name,
      status: "draft",
      revision: 1,
      objective: row.description,
      nodeCount: Array.isArray(row.definition?.nodes) ? row.definition.nodes.length : 0,
      createdAt: postgresTime(row.created_at),
      updatedAt: postgresTime(row.updated_at),
    }));
    return {
      ...(workflows[0] ? { activeWorkflowId: workflows[0].workflowId } : {}),
      workflows,
    };
  }

  async loadWorkflowWorkbench(): Promise<WorkflowWorkbenchSnapshot> {
    const result = await this.database.query<{
      workflow_id: string;
      workflow_title: string;
      node_count: number;
      workflow_updated_at: unknown;
      run_status: string | null;
      run_started_at: unknown;
      run_finished_at: unknown;
      total_count: number;
      active_count: number;
    }>(`
      WITH workflow_overview AS (
        SELECT
          workflow.id AS workflow_id,
          workflow.name AS workflow_title,
          CASE
            WHEN jsonb_typeof(workflow.definition -> 'nodes') = 'array'
              THEN jsonb_array_length(workflow.definition -> 'nodes')
            ELSE 0
          END AS node_count,
          workflow.updated_at AS workflow_updated_at,
          selected_run.status AS run_status,
          selected_run.started_at AS run_started_at,
          selected_run.finished_at AS run_finished_at
        FROM agent_recall.workflows AS workflow
        LEFT JOIN LATERAL (
          SELECT run.status, run.started_at, run.finished_at
          FROM agent_recall.workflow_runs AS run
          WHERE run.workflow_id = workflow.id
          ORDER BY
            CASE WHEN run.status IN ('running', 'waiting', 'paused') THEN 0 ELSE 1 END,
            run.started_at DESC,
            run.id
          LIMIT 1
        ) AS selected_run ON true
        WHERE workflow.definition -> 'isTemplate' IS DISTINCT FROM 'true'::jsonb
      ),
      counted AS (
        SELECT
          workflow_overview.*,
          count(*) OVER ()::integer AS total_count,
          count(*) FILTER (
            WHERE run_status IN ('running', 'waiting')
          ) OVER ()::integer AS active_count
        FROM workflow_overview
      )
      SELECT *
      FROM counted
      ORDER BY
        CASE
          WHEN run_status = 'waiting' THEN 0
          WHEN run_status = 'running' THEN 1
          WHEN run_status = 'failed' THEN 2
          WHEN run_status IS NULL THEN 3
          WHEN run_status IN ('paused', 'cancelled') THEN 4
          WHEN run_status = 'completed' THEN 5
          ELSE 3
        END,
        GREATEST(
          workflow_updated_at,
          COALESCE(run_finished_at, run_started_at, workflow_updated_at)
        ) DESC,
        workflow_id
      LIMIT $1
    `, [WORKFLOW_WORKBENCH_LIMIT]);
    const workflows: WorkflowWorkbenchItem[] = result.rows.map((row) => {
      const workflowUpdatedAt = postgresTime(row.workflow_updated_at);
      const runUpdatedAt = postgresTime(row.run_finished_at ?? row.run_started_at);
      const status: WorkflowWorkbenchItem["status"] =
        row.run_status === "waiting"
          ? "waiting_for_user"
          : row.run_status === "paused" || row.run_status === "cancelled"
            ? "stopped"
            : row.run_status === "running"
              || row.run_status === "failed"
              || row.run_status === "completed"
              ? row.run_status
              : "draft";
      return {
        workflow: {
          workflowId: row.workflow_id,
          title: row.workflow_title,
        },
        nodeCount: Number(row.node_count),
        status,
        updatedAt: Math.max(workflowUpdatedAt, runUpdatedAt),
      };
    });
    return {
      workflows,
      totalCount: Number(result.rows[0]?.total_count ?? 0),
      activeCount: Number(result.rows[0]?.active_count ?? 0),
    };
  }

  async save(payload: PersistedAppStateV5): Promise<void> {
    if (payload.version !== 5) {
      throw new Error("PostgreSQL persistence only supports app state version 5");
    }
    await this.database.transaction(async (transaction) => {
      const now = new Date();
      await this.writeSetting(transaction, "payload_version", String(payload.version), now);
      await this.writeSetting(transaction, "active_chat_id", payload.activeChatId, now);
      await this.writeSetting(transaction, "work_dir", asString(payload.workDir), now);
      await transaction.query(
        `insert into agent_recall.app_aux_state (id, payload, updated_at)
         values ($1, $2::jsonb, $3)
         on conflict (id) do update set
           payload = excluded.payload,
           updated_at = excluded.updated_at`,
        [
          AUX_STATE_ID,
          jsonParameter({
            ...payload,
            sessions: undefined,
            messages: undefined,
            events: undefined,
            workflowStore: undefined,
          }),
          now,
        ],
      );
      await this.chats.replace(transaction, asRecord(payload));
    });
  }

  close(): void {
    // The application owns the shared PostgreSQL connection pool.
  }

  isShutdownError(error: unknown): boolean {
    return this.database.isClosedError(error);
  }

  private async writeSetting(
    database: PostgresQueryable,
    key: string,
    value: string | null,
    now: Date,
  ): Promise<void> {
    await database.query(
      `insert into agent_recall.app_settings (key, value_text, updated_at)
       values ($1, $2, $3)
       on conflict (key) do update set
         value_text = excluded.value_text,
         updated_at = excluded.updated_at`,
      [key, value, now],
    );
  }
}
