// processors/OutboxProcessor.ts
import { OutboxRepository } from '../db/OutboxRepository'
import { EventPublisher } from '../publishers/OutboxPublisher'
import { OutboxConfig } from '../types/outbox'

export class OutboxProcessor {
    private isRunning: boolean = false
    private processingInterval: NodeJS.Timeout | null = null
    private cleanupInterval: NodeJS.Timeout | null = null

    constructor(
        private repository: OutboxRepository,
        private publisher: EventPublisher,
        private config: OutboxConfig
    ) { }

    /**
     * Inicia el procesamiento continuo de eventos
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.warn('OutboxProcessor ya está ejecutándose')
            return
        }

        console.log('Iniciando OutboxProcessor...')

        try {
            await this.publisher.connect()
            this.isRunning = true

            // Procesamiento de eventos
            this.processingInterval = setInterval(
                () => this.processEvents(),
                this.config.processingInterval
            )

            // Limpieza de eventos antiguos (cada hora)
            this.cleanupInterval = setInterval(
                () => this.cleanup(),
                60 * 60 * 1000
            )

            // Procesa inmediatamente al iniciar
            await this.processEvents()

            console.log('OutboxProcessor iniciado correctamente')
        } catch (error) {
            console.error('Error iniciando OutboxProcessor:', error)
            this.isRunning = false
            throw error
        }
    }

    /**
     * Detiene el procesamiento
     */
    async stop(): Promise<void> {
        console.log('🛑 Deteniendo OutboxProcessor...')

        this.isRunning = false

        if (this.processingInterval) {
            clearInterval(this.processingInterval)
            this.processingInterval = null
        }

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }

        await this.publisher.disconnect()

        console.log('✅ OutboxProcessor detenido')
    }

    /**
     * Procesa un lote de eventos pendientes
     */
    private async processEvents(): Promise<void> {
        if (!this.isRunning) return

        try {
            const events = await this.repository.getPendingEvents(
                this.config.batchSize,
                this.config.lockTimeout
            )

            if (events.length === 0) {
                return
            }

            console.log(`📦 Procesando ${events.length} eventos pendientes...`)

            const results = await Promise.allSettled(
                events.map(event => this.processEvent(event))
            )

            const succeeded = results.filter(r => r.status === 'fulfilled').length
            const failed = results.filter(r => r.status === 'rejected').length

            console.log(`✅ Procesados: ${succeeded} exitosos, ${failed} fallidos`)

            // Mostrar estadísticas cada 10 ciclos
            if (Math.random() < 0.1) {
                await this.logStats()
            }
        } catch (error) {
            console.error('❌ Error en ciclo de procesamiento:', error)
        }
    }

    /**
     * Procesa un evento individual
     */
    private async processEvent(event: any): Promise<void> {
        try {
            // Publica el evento
            await this.publisher.publish(event)

            // Marca como completado
            await this.repository.markAsCompleted(event.id)

            console.log(`✅ Evento ${event.id} procesado exitosamente`)
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido'

            console.error(`❌ Error procesando evento ${event.id}:`, errorMessage)

            // Marca como fallido y programa retry
            await this.repository.markAsFailed(
                event.id,
                errorMessage,
                this.config.retryBackoffMs
            )

            throw error
        }
    }

    /**
     * Limpia eventos antiguos completados
     */
    private async cleanup(): Promise<void> {
        try {
            const deleted = await this.repository.cleanupOldEvents(7)
            if (deleted > 0) {
                console.log(`🧹 Limpieza: ${deleted} eventos antiguos eliminados`)
            }
        } catch (error) {
            console.error('❌ Error en limpieza de eventos:', error)
        }
    }

    /**
     * Muestra estadísticas de la outbox
     */
    private async logStats(): Promise<void> {
        try {
            const stats = await this.repository.getStats()
            console.log('📊 Estadísticas Outbox (últimas 24h):', {
                pending: stats.pending,
                processing: stats.processing,
                completed: stats.completed,
                failed: stats.failed,
                total: stats.total,
                successRate: stats.total > 0
                    ? `${((stats.completed / stats.total) * 100).toFixed(2)}%`
                    : 'N/A'
            })
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error)
        }
    }

    /**
     * Procesamiento manual (útil para testing)
     */
    async processOnce(): Promise<void> {
        await this.processEvents()
    }
}