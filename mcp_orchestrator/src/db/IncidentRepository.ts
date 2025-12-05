import { Pool, PoolClient } from 'pg'
import { DetectedIncident, IncidentStatus, IncidentSeverity } from '../types/incident'

export class IncidentRepository {
    constructor(private pool: Pool) { }

    async initialize(): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS incidents (
          id BIGSERIAL PRIMARY KEY,
          incident_type VARCHAR(100) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'detected',
          log_id BIGINT NOT NULL,
          log_type VARCHAR(20) NOT NULL,
          details JSONB NOT NULL,
          runbook_url TEXT,
          detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          notified_at TIMESTAMPTZ,
          acknowledged_at TIMESTAMPTZ,
          resolved_at TIMESTAMPTZ,
          acknowledged_by VARCHAR(255),
          resolved_by VARCHAR(255),
          resolution_notes TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          CONSTRAINT check_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
          CONSTRAINT check_status CHECK (status IN ('detected', 'notified', 'acknowledged', 'investigating', 'resolved'))
        );

        -- Índices para optimizar queries
        CREATE INDEX IF NOT EXISTS idx_incidents_status_severity 
          ON incidents(status, severity, detected_at DESC);

        CREATE INDEX IF NOT EXISTS idx_incidents_log_ref 
          ON incidents(log_type, log_id);

        CREATE INDEX IF NOT EXISTS idx_incidents_detected_at 
          ON incidents(detected_at DESC);

        -- Trigger para actualizar updated_at
        CREATE OR REPLACE FUNCTION update_incidents_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_update_incidents_updated_at ON incidents;
        CREATE TRIGGER trigger_update_incidents_updated_at
          BEFORE UPDATE ON incidents
          FOR EACH ROW
          EXECUTE FUNCTION update_incidents_updated_at();
      `)

            console.error('✅ Tabla incidents inicializada')
        } catch (error) {
            console.error('❌ Error inicializando tabla incidents:', error)
            throw error
        } finally {
            client.release()
        }
    }

    /**
     * Inserta múltiples incidentes en una transacción
     */
    async insertIncidents(
        client: PoolClient,
        incidents: DetectedIncident[]
    ): Promise<number[]> {
        if (incidents.length === 0) return []

        const values: string[] = []
        const params: any[] = []
        let paramIndex = 1

        for (const incident of incidents) {
            values.push(
                `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
            )
            params.push(
                incident.incident_type,
                incident.severity,
                incident.status,
                incident.log_id,
                incident.log_type,
                JSON.stringify(incident.details),
                incident.runbook_url,
                incident.detected_at
            )
            paramIndex += 8
        }

        const query = `
      INSERT INTO incidents 
        (incident_type, severity, status, log_id, log_type, details, runbook_url, detected_at)
      VALUES ${values.join(', ')}
      RETURNING id
    `

        const result = await client.query(query, params)
        return result.rows.map(r => r.id)
    }

    /**
     * Marca incidentes como notificados
     */
    async markAsNotified(incidentIds: number[]): Promise<void> {
        if (incidentIds.length === 0) return

        await this.pool.query(
            `UPDATE incidents
       SET status = $1,
           notified_at = NOW()
       WHERE id = ANY($2)`,
            [IncidentStatus.NOTIFIED, incidentIds]
        )
    }

    /**
     * Obtiene incidentes activos (no resueltos)
     */
    async getActiveIncidents(limit: number = 50): Promise<DetectedIncident[]> {
        const result = await this.pool.query(
            `SELECT 
        id, incident_type, severity, status, log_id, log_type,
        details, runbook_url, detected_at, notified_at, 
        acknowledged_at, resolved_at
       FROM incidents
       WHERE status != 'resolved'
       ORDER BY detected_at DESC
       LIMIT $1`,
            [limit]
        )

        return result.rows
    }

    /**
     * Obtiene incidentes por severidad
     */
    async getIncidentsBySeverity(
        severity: IncidentSeverity,
        limit: number = 50
    ): Promise<DetectedIncident[]> {
        const result = await this.pool.query(
            `SELECT 
        id, incident_type, severity, status, log_id, log_type,
        details, runbook_url, detected_at, notified_at,
        acknowledged_at, resolved_at
       FROM incidents
       WHERE severity = $1
       ORDER BY detected_at DESC
       LIMIT $2`,
            [severity, limit]
        )

        return result.rows
    }

    /**
     * Obtiene estadísticas de incidentes
     */
    async getStats(hoursBack: number = 24): Promise<{
        total: number
        by_severity: Record<string, number>
        by_status: Record<string, number>
        mttr_minutes?: number
    }> {
        const result = await this.pool.query(
            `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE severity = 'high') as high,
        COUNT(*) FILTER (WHERE severity = 'medium') as medium,
        COUNT(*) FILTER (WHERE severity = 'low') as low,
        COUNT(*) FILTER (WHERE status = 'detected') as detected,
        COUNT(*) FILTER (WHERE status = 'notified') as notified,
        COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
        COUNT(*) FILTER (WHERE status = 'investigating') as investigating,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        AVG(
          EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 60
        ) FILTER (WHERE status = 'resolved') as mttr_minutes
       FROM incidents
       WHERE detected_at > NOW() - ($1 * INTERVAL '1 hour')`,
            [hoursBack]
        )

        const row = result.rows[0]

        return {
            total: parseInt(row.total),
            by_severity: {
                critical: parseInt(row.critical),
                high: parseInt(row.high),
                medium: parseInt(row.medium),
                low: parseInt(row.low)
            },
            by_status: {
                detected: parseInt(row.detected),
                notified: parseInt(row.notified),
                acknowledged: parseInt(row.acknowledged),
                investigating: parseInt(row.investigating),
                resolved: parseInt(row.resolved)
            },
            mttr_minutes: row.mttr_minutes ? parseFloat(row.mttr_minutes) : undefined
        }
    }

    /**
     * Actualiza estado de incidente (para ChatOps)
     */
    async updateIncidentStatus(
        incidentId: number,
        status: IncidentStatus,
        user?: string,
        notes?: string
    ): Promise<void> {
        const updates: string[] = ['status = $1']
        const params: any[] = [status, incidentId]
        let paramIndex = 3

        if (status === IncidentStatus.ACKNOWLEDGED) {
            updates.push(`acknowledged_at = NOW()`)
            if (user) {
                updates.push(`acknowledged_by = $${paramIndex}`)
                params.splice(paramIndex - 1, 0, user)
                paramIndex++
            }
        }

        if (status === IncidentStatus.RESOLVED) {
            updates.push(`resolved_at = NOW()`)
            if (user) {
                updates.push(`resolved_by = $${paramIndex}`)
                params.splice(paramIndex - 1, 0, user)
                paramIndex++
            }
            if (notes) {
                updates.push(`resolution_notes = $${paramIndex}`)
                params.splice(paramIndex - 1, 0, notes)
            }
        }

        await this.pool.query(
            `UPDATE incidents
       SET ${updates.join(', ')}
       WHERE id = $2`,
            params
        )
    }

    /**
     * Calcula el MTTR (Mean Time To Resolution) de un incidente
     */
    async calculateMTTR(incidentId: number): Promise<number | null> {
        const result = await this.pool.query(
            `SELECT 
                EXTRACT(EPOCH FROM (resolved_at - detected_at)) / 60 as mttr_minutes
             FROM incidents
             WHERE id = $1 AND resolved_at IS NOT NULL`,
            [incidentId]
        )

        if (result.rows.length === 0) {
            return null
        }

        return parseFloat(result.rows[0].mttr_minutes)
    }

    /**
     * Obtiene detalles completos de un incidente para notificaciones
     */
    async getIncidentDetails(incidentId: number): Promise<any | null> {
        const result = await this.pool.query(
            `SELECT 
                id, incident_type, severity, status, log_id, log_type,
                details, runbook_url, detected_at, notified_at,
                acknowledged_at, resolved_at, acknowledged_by, resolved_by,
                resolution_notes
             FROM incidents
             WHERE id = $1`,
            [incidentId]
        )
        if (result.rows.length === 0) {
            return null
        }

        return result.rows[0] || null
    }

    /**
     * Busca un incidente activo por job_name y build_number
     * Usado para resolver incidentes cuando se ejecuta restart/rollback
     */
    async findByJobAndBuild(
        client: PoolClient,
        jobName: string,
        buildNumber: number
    ): Promise<DetectedIncident | null> {
        const result = await client.query(
            `SELECT * FROM incidents 
             WHERE details->>'job_name' = $1 
             AND (details->>'build_number')::int = $2
             AND status != 'resolved'
             ORDER BY detected_at DESC
             LIMIT 1`,
            [jobName, buildNumber]
        )

        return result.rows[0] || null
    }

    /**
     * Marca un incidente como resuelto
     * Actualiza status, resolved_at, y agrega detalles de resolución
     */
    async markAsResolved(
        client: PoolClient,
        incidentId: number,
        resolutionMethod: string,
        resolvedBy: string
    ): Promise<void> {
        await client.query(
            `UPDATE incidents 
             SET status = 'resolved',
                 resolved_at = NOW(),
                 resolved_by = $2,
                 details = details || jsonb_build_object(
                   'resolution_method', $3,
                   'resolved_by', $2
                 )
             WHERE id = $1`,
            [incidentId, resolvedBy, resolutionMethod]
        )
    }
}