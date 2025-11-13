#!/usr/bin/env node
/**
 * hybrid-mcp-http.ts
 * 
 * Servidor híbrido que ejecuta:
 * 1. HTTP Server - Recibe logs de Elasticsearch vía POST /mcp/logs/api
 * 2. MCP Server - Escucha comandos de Claude Desktop por stdio
 * 
 * Ambos comparten la misma instancia de LogsService y PostgreSQL
 */

import { MCPServer } from './server/MCPServer'
import { HTTPServer } from './server/HTTPServer'
import { LogsService } from './db/LogsService'
import { Config } from './config/Config'

let httpServer: HTTPServer | null = null
let mcpServer: MCPServer | null = null
let logsService: LogsService | null = null

async function main() {
    try {
        // Redirigir console.log a stderr (stdout es reservado para MCP protocol)
        console.log = console.error

        console.error('[HYBRID] Iniciando Servidor Híbrido (HTTP + MCP)...')

        const config = Config.getInstance()
        logsService = new LogsService()

        // PASO 1: Inicializar base de datos (compartida)
        console.error('[HYBRID] Inicializando base de datos...')
        await logsService.initialize()
        console.error('[HYBRID] Base de datos inicializada')

        // PASO 2: Levantar HTTP Server (Opcional - falla no detiene ejecución)
        console.error('[HYBRID] Iniciando HTTP Server para recibir logs...')
        httpServer = new HTTPServer(logsService, config.serverConfig)
        try {
            await httpServer.start()
            console.error(`[HYBRID] HTTP Server escuchando en puerto ${config.serverConfig.httpPort}`)
            console.error(`[HYBRID] Envía logs aquí: POST http://localhost:${config.serverConfig.httpPort}/mcp/logs/api`)
        } catch (httpError) {
            console.error('[HYBRID] HTTP Server falló, pero continuando con MCP:', httpError)
            httpServer = null // Marcar como no disponible
        }

        // PASO 3: Levantar MCP Server (CRÍTICO - debe funcionar)
        console.error('[HYBRID] 📡 Iniciando MCP Server para Claude Desktop...')
        mcpServer = new MCPServer(logsService, config.serverConfig)
        await mcpServer.start()
        console.error('[HYBRID] MCP Server listo en stdio')

        // PASO 4: Mantener proceso vivo
        process.stdin.resume()
        console.error('[HYBRID] Servidor híbrido completamente operacional')
        console.error('[HYBRID] Aguardando logs de Elasticsearch y comandos de Claude...')

        // PASO 5: Graceful shutdown
        const shutdown = async (signal: string) => {
            console.error(`\n[HYBRID] Señal ${signal} recibida, iniciando shutdown graceful...`)

            try {
                // Cerrar MCP primero (detiene nuevo input)
                if (mcpServer) {
                    console.error('[HYBRID] Cerrando MCP Server...')
                    await mcpServer.close()
                    console.error('[HYBRID] MCP Server cerrado')
                }

                // Cerrar HTTP (si está disponible)
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
