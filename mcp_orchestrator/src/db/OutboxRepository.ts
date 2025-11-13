// db/OutboxRepository.ts
import { Pool, PoolClient } from 'pg'
import { OutboxEvent, OutboxEventStatus } from '../types/outbox'

export class OutboxRepository {
    constructor(private pool: Pool) { }

    async initialize(): Promise<void> {
        const client = await this.pool.connect()
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS outbox_events (
          id BIGSERIAL PRIMARY KEY,
          event_type VARCHAR(100) NOT NULL,
          aggregate_id VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          retry_count INTEGER NOT NULL DEFAULT 0,
          max_retries INTEGER NOT NULL DEFAULT 3,
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          processed_at TIMESTAMPTZ,
          next_retry_at TIMESTAMPTZ,
          CONSTRAINT check_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
        );

        -- Índices para optimizar queries
        CREATE INDEX IF NOT EXISTS idx_outbox_status_next_retry 
          ON outbox_events(status, next_retry_at) 
          WHERE status IN ('pending', 'failed');

        CREATE INDEX IF NOT EXISTS idx_outbox_created_at 
          ON outbox_events(created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_outbox_aggregate 
          ON outbox_events(aggregate_id, event_type);
      `)

            console.error('Tabla outbox_events inicializada')
        } catch (error) {
            console.error('Error inicializando outbox_events:', error)
            throw error
        } finally {
            client.release()
        }
    }

    /**
     * Inserta un evento en la outbox dentro de una transacción existente
     */
    async insertEvent(
        client: PoolClient,
        event: Omit<OutboxEvent, 'id' | 'created_at'>
    ): Promise<number> {
        const result = await client.query(
            `INSERT INTO outbox_events 
        (event_type, aggregate_id, payload, status, retry_count, max_retries, next_retry_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
            [
                event.event_type,
                event.aggregate_id,
                JSON.stringify(event.payload),
                event.status,
                event.retry_count,
                event.max_retries,
                event.next_retry_at || new Date()
            ]
        )

        return result.rows[0].id
    }

    /**
     * Obtiene eventos pendientes para procesar (con lock pessimista)
     */
    async getPendingEvents(
        limit: number,
        lockTimeoutSeconds: number
    ): Promise<OutboxEvent[]> {
        const client = await this.pool.connect()
        try {
            await client.query('BEGIN')

            // SELECT FOR UPDATE SKIP LOCKED: evita bloqueos entre múltiples procesadores
            const result = await client.query(
                `UPDATE outbox_events
         SET status = 'processing',
             processed_at = NOW()
         WHERE id IN (
           SELECT id FROM outbox_events
           WHERE (status = 'pending' OR status = 'failed')
             AND (next_retry_at IS NULL OR next_retry_at <= NOW())
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING 
           id, event_type, aggregate_id, payload, status,
           retry_count, max_retries, error_message,
           created_at, processed_at, next_retry_at`,
                [limit]
            )

            await client.query('COMMIT')

            return result.rows.map(row => ({
                ...row,
                payload: row.payload
            }))
        } catch (error) {
            await client.query('ROLLBACK')
            console.error('Error obteniendo eventos pendientes:', error)
            throw error
        } finally {
            client.release()
        }
    }

    /**
     * Marca evento como completado
     */
    async markAsCompleted(eventId: number): Promise<void> {
        await this.pool.query(
            `UPDATE outbox_events
       SET status = 'completed',
           processed_at = NOW()
       WHERE id = $1`,
            [eventId]
        )
    }

    /**
     * Marca evento como fallido y programa retry
     */
    async markAsFailed(
        eventId: number,
        errorMessage: string,
        retryBackoffMs: number
    ): Promise<void> {
        await this.pool.query(
            `UPDATE outbox_events
       SET status = CASE 
           WHEN retry_count + 1 >= max_retries THEN 'failed'
           ELSE 'pending'
         END,
         retry_count = retry_count + 1,
         error_message = $2,
         next_retry_at = NOW() + ($3 * POWER(2, retry_count) * INTERVAL '1 millisecond'),
         processed_at = NOW()
       WHERE id = $1`,
            [eventId, errorMessage, retryBackoffMs]
        )
    }

    /**
     * Obtiene estadísticas de la outbox
     */
    async getStats(): Promise<{
        pending: number
        processing: number
        completed: number
        failed: number
        total: number
    }> {
        const result = await this.pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM outbox_events
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `)

        return result.rows[0]
    }

    /**
     * Limpia eventos antiguos completados
     */
    async cleanupOldEvents(daysToKeep: number = 7): Promise<number> {
        const result = await this.pool.query(
            `DELETE FROM outbox_events
       WHERE status = 'completed'
         AND processed_at < NOW() - ($1 * INTERVAL '1 day')`,
            [daysToKeep]
        )

        return result.rowCount || 0
    }
}