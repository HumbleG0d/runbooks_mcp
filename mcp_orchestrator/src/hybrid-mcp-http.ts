import { MCPServer } from './server/MCPServer'
import { HTTPServer } from './server/HTTPServer'
import { LogsService } from './db/LogsService'
import { Config } from './config/Config'
import { OutboxProcessor } from './outbox/OutboxProcessor'
import { ConsolePublisher, RabbitMQPublisher } from './publishers/OutboxPublisher'

let httpServer: HTTPServer | null = null
let mcpServer: MCPServer | null = null
let logsService: LogsService | null = null
let outboxProcessor: OutboxProcessor | null = null

async function main() {
    try {
        // Redirigir console.log a stderr (stdout es reservado para MCP protocol)
        console.log = console.error

        console.error('[HYBRID] Iniciando Servidor Híbrido (HTTP + MCP + Outbox)...')

        const config = Config.getInstance()
        logsService = new LogsService()

        // PASO 1: Inicializar base de datos (compartida)
        console.error('[HYBRID] Inicializando base de datos...')
        await logsService.initialize()
        console.error('[HYBRID] Base de datos inicializada')

        // PASO 2: Configurar y arrancar OutboxProcessor
        console.error('[HYBRID] Iniciando OutboxProcessor...')
        const publisher = process.env.NODE_ENV === 'production'
            ? new RabbitMQPublisher(process.env.RABBITMQ_URL || 'amqp://localhost:5672')
            : new ConsolePublisher()

        outboxProcessor = new OutboxProcessor(
            logsService.getOutboxRepository(),
            publisher,
            config.outboxConfig
        )

        await outboxProcessor.start()
        console.error('[HYBRID] OutboxProcessor iniciado (procesando cada 5s)')

        // PASO 3: Levantar HTTP Server (Opcional - falla no detiene ejecución)
        console.error('[HYBRID] Iniciando HTTP Server para recibir logs...')
        httpServer = new HTTPServer(logsService, config.serverConfig)
        try {
            await httpServer.start()
            console.error(`[HYBRID] HTTP Server escuchando en puerto ${config.serverConfig.httpPort}`)
            console.error(`[HYBRID] Envía logs aquí: POST http://localhost:${config.serverConfig.httpPort}/mcp/logs/api`)
        } catch (httpError) {
            console.error('[HYBRID] HTTP Server falló, pero continuando con MCP:', httpError)
            httpServer = null
        }

        // PASO 4: Levantar MCP Server (CRÍTICO - debe funcionar)
        console.error('[HYBRID] Iniciando MCP Server para Claude Desktop...')
        mcpServer = new MCPServer(logsService, config.serverConfig)
        await mcpServer.start()
        console.error('[HYBRID] MCP Server listo en stdio')

        // PASO 5: Mantener proceso vivo
        process.stdin.resume()
        console.error('')
        console.error('╔═══════════════════════════════════════════════════════╗')
        console.error('║  SERVIDOR HÍBRIDO OPERACIONAL                     ║')
        console.error('╠═══════════════════════════════════════════════════════╣')
        console.error('║  MCP Server:         Activo (stdio)               ║')
        console.error(`║  HTTP Server:        Puerto ${config.serverConfig.httpPort.toString().padEnd(21)}       ║`)
        console.error('║  OutboxProcessor:    Cada 5 segundos              ║')
        console.error('║  PostgreSQL:         Conectado                    ║')
        console.error('╚═══════════════════════════════════════════════════════╝')
        console.error('')

        // PASO 6: Graceful shutdown
        const shutdown = async (signal: string) => {
            console.error(`\n[HYBRID] Señal ${signal} recibida, iniciando shutdown graceful...`)

            try {
                // Detener OutboxProcessor primero
                if (outboxProcessor) {
                    console.error('[HYBRID] Deteniendo OutboxProcessor...')
                    await outboxProcessor.stop()
                    console.error('[HYBRID] OutboxProcessor detenido')
                }

                // Cerrar MCP
                if (mcpServer) {
                    console.error('[HYBRID] Cerrando MCP Server...')
                    await mcpServer.close()
                    console.error('[HYBRID] MCP Server cerrado')
                }

                // Cerrar HTTP
                if (httpServer) {
                    console.error('[HYBRID] Cerrando HTTP Server...')
                    await httpServer.close()
                    console.error('[HYBRID] HTTP Server cerrado')
                }

                // Cerrar BD última
                if (logsService) {
                    console.error('[HYBRID] Cerrando conexión a Base de Datos...')
                    await logsService.close()
                    console.error('[HYBRID] Base de datos cerrada')
                }

                console.error('[HYBRID] Shutdown completado correctamente')
                process.exit(0)
            } catch (error) {
                console.error('[HYBRID] Error durante shutdown:', error)
                process.exit(1)
            }
        }

        process.on('SIGINT', () => shutdown('SIGINT'))
        process.on('SIGTERM', () => shutdown('SIGTERM'))

    } catch (error) {
        console.error('[HYBRID] Error fatal durante inicio:', error)
        process.exit(1)
    }
}

main().catch((error) => {
    console.error('[HYBRID] Error no manejado en main():', error)
    process.exit(1)
})