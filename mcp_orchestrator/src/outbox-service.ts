
import { Pool } from 'pg'
import { OutboxRepository } from './db/OutboxRepository'
import { RabbitMQPublisher } from './publishers/OutboxPublisher'
import { OutboxProcessor } from './outbox/OutboxProcessor'
import { OutboxConfig } from './types/outbox'

async function main() {
    console.error('Iniciando Outbox Processor Service')

    // Configuración de PostgreSQL
    const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'mcp_logs',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    })

    try {
        // Verificar conexión a PostgreSQL
        const client = await pool.connect()
        console.error('✓ Conectado a PostgreSQL')
        client.release()

        // Inicializar repositorio
        const outboxRepo = new OutboxRepository(pool)
        await outboxRepo.initialize()
        console.error('✓ Repositorio Outbox inicializado\n')

        // Configuración del Outbox Processor
        const config: OutboxConfig = {
            processingInterval: parseInt(process.env.OUTBOX_PROCESSING_INTERVAL || '5000'), // 5 segundos
            batchSize: parseInt(process.env.OUTBOX_BATCH_SIZE || '10'),
            lockTimeout: parseInt(process.env.OUTBOX_LOCK_TIMEOUT || '30'),
            retryBackoffMs: parseInt(process.env.OUTBOX_RETRY_BACKOFF_MS || '1000'),
            maxRetries: parseInt(process.env.OUTBOX_MAX_RETRIES || '3')
        }

        console.error('Configuración Outbox Processor:')
        console.error(`  - Processing Interval: ${config.processingInterval}ms`)
        console.error(`  - Batch Size: ${config.batchSize}`)
        console.error(`  - Lock Timeout: ${config.lockTimeout}s`)
        console.error(`  - Retry Backoff: ${config.retryBackoffMs}ms`)
        console.error(`  - Max Retries: ${config.maxRetries}\n`)

        // Crear publisher de RabbitMQ
        const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672'
        const publisher = new RabbitMQPublisher(rabbitUrl)

        // Crear y arrancar el processor
        const processor = new OutboxProcessor(outboxRepo, publisher, config)
        await processor.start()

        console.error('Outbox Processor Service INICIADO')
        console.error('Procesando eventos cada', config.processingInterval, 'ms')

        // Manejo de señales para shutdown graceful
        const shutdown = async (signal: string) => {
            console.error(`\n${signal} recibido, deteniendo Outbox Processor...`)
            await processor.stop()
            await pool.end()
            console.error('Outbox Processor detenido correctamente')
            process.exit(0)
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        // Mantener el proceso vivo
        process.on('uncaughtException', (error) => {
            console.error('Error no capturado:', error)
            shutdown('UNCAUGHT_EXCEPTION')
        })

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Promise rechazada no manejada:', promise, 'razón:', reason)
        })

    } catch (error) {
        console.error('Error fatal iniciando Outbox Processor Service:', error)
        await pool.end()
        process.exit(1)
    }
}

// Ejecutar el servicio
main().catch((error) => {
    console.error('Error fatal:', error)
    process.exit(1)
})
