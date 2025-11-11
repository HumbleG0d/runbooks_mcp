// index.ts - APLICACIÓN PRINCIPAL
import { HTTPServer } from './server/HTTPServer'
import { LogsService } from './db/LogsService'
import { Config } from './config/Config'
import { OutboxProcessor } from './outbox/OutboxProcessor'
import { RabbitMQPublisher, ConsolePublisher } from './publishers/OutboxPublisher'

async function main() {
    console.log('Iniciando Runbooks MCP Server con Outbox Pattern...')

    const config = Config.getInstance()
    const logsService = new LogsService()

    // Inicializar base de datos
    await logsService.initialize()

    // Configurar publisher (usa ConsolePublisher para testing, RabbitMQPublisher para producción)
    const publisher = process.env.NODE_ENV === 'production'
        ? new RabbitMQPublisher(process.env.RABBITMQ_URL || 'amqp://localhost')
        : new ConsolePublisher()

    // Crear y arrancar OutboxProcessor
    const outboxProcessor = new OutboxProcessor(
        logsService.getOutboxRepository(),
        publisher,
        config.outboxConfig
    )

    await outboxProcessor.start()

    // Crear y arrancar servidor HTTP
    const httpServer = new HTTPServer(logsService, config.serverConfig)
    await httpServer.start()

    // Manejo de señales para shutdown graceful
    const shutdown = async (signal: string) => {
        console.log(`\nSeñal ${signal} recibida, cerrando servidor...`)

        try {
            await outboxProcessor.stop()
            await logsService.close()
            console.log('Servidor cerrado correctamente')
            process.exit(0)
        } catch (error) {
            console.error('Error durante el cierre:', error)
            process.exit(1)
        }
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║  🎯 Runbooks MCP Server + Outbox Pattern READY       ║
  ║                                                       ║
  ║  HTTP Server:    http://localhost:${config.serverConfig.httpPort}           ║
  ║  Outbox:         Procesando cada ${config.outboxConfig.processingInterval}ms          ║
  ║  Publisher:      ${publisher.constructor.name.padEnd(30)} ║
  ╚═══════════════════════════════════════════════════════╝
  `)
}

// Ejecutar aplicación
main().catch((error) => {
    console.error('❌ Error fatal:', error)
    process.exit(1)
})