// http_server_main.ts

import { Config } from './config/Config'
import { LogsService } from './db/LogsService'
import { HTTPServer } from './server/HTTPServer'

async function startHttpServer() {
    try {
        const config = Config.getInstance()
        const logService = new LogsService()

        // Opcional: inicializar DB si el servidor HTTP depende de ella
        await logService.initialize()

        const httpServer = new HTTPServer(logService, config.serverConfig)
        await httpServer.start()

        console.log(`[MAIN HTTP] Servidor de logs HTTP corriendo en el puerto ${config.serverConfig.httpPort}`)

    } catch (error) {
        console.error('[MAIN HTTP] Error FATAL iniciando el servidor HTTP:', error)
        process.exit(1)
    }
}

startHttpServer()