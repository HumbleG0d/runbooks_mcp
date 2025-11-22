import { Pool, PoolClient } from 'pg'
import { ActionStatus, ActionType } from '../types/actions'

export interface ActionRequest {
    id?: number
    action_type: ActionType
    target_job: string
    target_build?: number
    incident_id?: number
    requested_by: string
    status: ActionStatus
    params?: Record<string, any>
    result?: string
    error_message?: string
    created_at?: Date
    started_at?: Date
    completed_at?: Date
}

export class ActionRequestRepository {
    constructor(private pool: Pool) { }

    async initialize(): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS action_executions (
          id BIGSERIAL PRIMARY KEY,
          action_type VARCHAR(50) NOT NULL,
          target_job VARCHAR(255) NOT NULL,
          target_build INTEGER,
          incident_id BIGINT,
          requested_by VARCHAR(255) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          params JSONB,
          result JSONB,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          duration_seconds INTEGER,
          CONSTRAINT check_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rejected')),
          CONSTRAINT fk_incident FOREIGN KEY (incident_id) REFERENCES incidents(id)
        );

        CREATE INDEX IF NOT EXISTS idx_actions_status 
          ON action_executions(status, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_actions_incident 
          ON action_executions(incident_id);
      `)

            console.error('Tabla action_executions inicializada')
        } catch (error) {
            console.error('Error inicializando action_executions:', error)
            throw error
        } finally {
            client.release()
        }
    }

    //Crea una solicitud de acción (dentro de transacción)
    async createActionRequest(
        client: PoolClient,
        action: Omit<ActionRequest, 'id' | 'created_at'>
    ): Promise<number> {
        const result = await client.query(
            `INSERT INTO action_executions 
        (action_type, target_job, target_build, incident_id, requested_by, status, params)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
            [
                action.action_type,
                action.target_job,
                action.target_build,
                action.incident_id,
                action.requested_by,
                action.status,
                action.params ? JSON.stringify(action.params) : null
            ]
        )

        return result.rows[0].id
    }

    //Obtiene una acción por ID
    async getActionById(actionId: number): Promise<ActionRequest | null> {
        const result = await this.pool.query(
            `SELECT * FROM action_executions WHERE id = $1`,
            [actionId]
        )

        if (result.rows.length === 0) return null

        const row = result.rows[0]
        return {
            id: row.id,
            action_type: row.action_type,
            target_job: row.target_job,
            target_build: row.target_build,
            incident_id: row.incident_id,
            requested_by: row.requested_by,
            status: row.status,
            params: row.params,
            result: row.result,
            error_message: row.error_message,
            created_at: row.created_at,
            started_at: row.started_at,
            completed_at: row.completed_at
        }
    }

    //Obtiene acciones pendientes
    async getPendingActions(limit: number = 50): Promise<ActionRequest[]> {
        const result = await this.pool.query(
            `SELECT * FROM action_executions 
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
            [limit]
        )

        return result.rows
    }

    //Obtiene acciones por incidente
    async getActionsByIncident(incidentId: number): Promise<ActionRequest[]> {
        const result = await this.pool.query(
            `SELECT * FROM action_executions 
       WHERE incident_id = $1
       ORDER BY created_at DESC`,
            [incidentId]
        )

        return result.rows
    }

    /**
     * Obtiene estadísticas de acciones
     */
    async getStats(hoursBack: number = 24): Promise<{
        total: number
        by_status: Record<string, number>
        by_type: Record<string, number>
        success_rate: number
    }> {
        const result = await this.pool.query(
            `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'running') as running,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE action_type = 'jenkins_restart') as restart,
        COUNT(*) FILTER (WHERE action_type = 'jenkins_rollback') as rollback,
        COUNT(*) FILTER (WHERE action_type = 'jenkins_stop') as stop
       FROM action_executions
       WHERE created_at > NOW() - ($1 * INTERVAL '1 hour')`,
            [hoursBack]
        )

        const row = result.rows[0]
        const total = parseInt(row.total)
        const completed = parseInt(row.completed)

        return {
            total,
            by_status: {
                pending: parseInt(row.pending),
                running: parseInt(row.running),
                completed,
                failed: parseInt(row.failed),
                rejected: parseInt(row.rejected)
            },
            by_type: {
                restart: parseInt(row.restart),
                rollback: parseInt(row.rollback),
                stop: parseInt(row.stop)
            },
            success_rate: total > 0 ? (completed / total) * 100 : 0
        }
    }
}