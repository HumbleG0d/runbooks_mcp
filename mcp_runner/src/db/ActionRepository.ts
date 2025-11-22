import { Pool } from 'pg'
import { ActionExecution, ActionStatus } from '../types/actions'

export class ActionRepository {
    constructor(private pool: Pool) { }

    /**
     * Obtiene una acción por ID
     */
    async getActionById(actionId: number): Promise<ActionExecution | null> {
        const result = await this.pool.query(
            'SELECT * FROM action_executions WHERE id = $1',
            [actionId]
        )

        if (result.rows.length === 0) return null

        return this.mapRowToAction(result.rows[0])
    }

    /**
     * Actualiza el estado de una acción a RUNNING
     */
    async markAsRunning(actionId: number): Promise<void> {
        await this.pool.query(
            `UPDATE action_executions
       SET status = $1,
           started_at = NOW()
       WHERE id = $2`,
            [ActionStatus.RUNNING, actionId]
        )

        console.error(`Acción #${actionId} marcada como RUNNING`)
    }

    /**
     * Marca una acción como COMPLETADA con resultado
     */
    async markAsCompleted(
        actionId: number,
        result: Record<string, any>
    ): Promise<void> {
        await this.pool.query(
            `UPDATE action_executions
       SET status = $1,
           completed_at = NOW(),
           result = $2,
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
       WHERE id = $3`,
            [ActionStatus.COMPLETED, JSON.stringify(result), actionId]
        )

        console.error(`Acción #${actionId} marcada como COMPLETED`)
    }

    /**
     * Marca una acción como FALLIDA con mensaje de error
     */
    async markAsFailed(actionId: number, errorMessage: string): Promise<void> {
        await this.pool.query(
            `UPDATE action_executions
       SET status = $1,
           completed_at = NOW(),
           error_message = $2,
           duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))
       WHERE id = $3`,
            [ActionStatus.FAILED, errorMessage, actionId]
        )

        console.error(`Acción #${actionId} marcada como FAILED: ${errorMessage}`)
    }

    /**
     * Marca una acción como RECHAZADA (no pasó validaciones de seguridad)
     */
    async markAsRejected(actionId: number, reason: string): Promise<void> {
        await this.pool.query(
            `UPDATE action_executions
       SET status = $1,
           completed_at = NOW(),
           error_message = $2
       WHERE id = $3`,
            [ActionStatus.REJECTED, reason, actionId]
        )

        console.error(`Acción #${actionId} RECHAZADA: ${reason}`)
    }

    /**
     * Obtiene el conteo de acciones en ejecución
     */
    async getRunningActionsCount(): Promise<number> {
        const result = await this.pool.query(
            `SELECT COUNT(*) as count
       FROM action_executions
       WHERE status = $1`,
            [ActionStatus.RUNNING]
        )

        return parseInt(result.rows[0].count)
    }

    /**
     * Obtiene acciones pendientes (para procesamiento)
     */
    async getPendingActions(limit: number = 10): Promise<ActionExecution[]> {
        const result = await this.pool.query(
            `SELECT * FROM action_executions
       WHERE status = $1
       ORDER BY created_at ASC
       LIMIT $2`,
            [ActionStatus.PENDING, limit]
        )

        return result.rows.map(row => this.mapRowToAction(row))
    }

    /**
     * Obtiene historial de acciones para un job
     */
    async getActionsByJob(jobName: string, limit: number = 50): Promise<ActionExecution[]> {
        const result = await this.pool.query(
            `SELECT * FROM action_executions
       WHERE target_job = $1
       ORDER BY created_at DESC
       LIMIT $2`,
            [jobName, limit]
        )

        return result.rows.map(row => this.mapRowToAction(row))
    }

    /**
     * Obtiene estadísticas de acciones
     */
    async getStats(hoursBack: number = 24): Promise<{
        total: number
        completed: number
        failed: number
        rejected: number
        avgDuration: number
    }> {
        const result = await this.pool.query(
            `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration
       FROM action_executions
       WHERE created_at > NOW() - ($1 * INTERVAL '1 hour')`,
            [hoursBack]
        )

        const row = result.rows[0]

        return {
            total: parseInt(row.total),
            completed: parseInt(row.completed),
            failed: parseInt(row.failed),
            rejected: parseInt(row.rejected),
            avgDuration: row.avg_duration ? parseFloat(row.avg_duration) : 0
        }
    }

    /**
     * Mapea una fila de BD a ActionExecution
     */
    private mapRowToAction(row: any): ActionExecution {
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
}