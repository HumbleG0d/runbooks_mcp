
import { LogsService } from './db/LogService'
import { Config } from './config/Config'
import { HTTPServer } from './server/HTTPServer'
import { MCPServer } from './server/MCPServer'

export class HybridMCPServerRefactored {
  private logService: LogsService
  private config: Config
  private mcpServer?: MCPServer
  private httpServer?: HTTPServer

  constructor() {
    this.config = Config.getInstance()
    this.logService = new LogsService()
  }


  public async runHybrid(): Promise<void> {
    try {
      // Iniciar servidor HTTP
      this.httpServer = new HTTPServer(this.logService, this.config.serverConfig)
      await this.httpServer.start()

      console.log('Modo híbrido activado:')
      console.log('HTTP: Ejecutándose en puerto', this.config.serverConfig.httpPort)
      console.log('MCP: Disponible para conexiones stdio')

      // Mantener el proceso vivo para MCP
      process.stdin.resume()
    } catch (error) {
      console.error('Error inicializando servidor híbrido:', error)
      throw error
    }
  }

 //Cierra todos los servidores de forma segura
  public async close(): Promise<void> {
    console.log('Cerrando servidores...')
    
    try {
      if (this.mcpServer) {
        await this.mcpServer.close()
      }
      
      await this.logService.close()
      console.log('Servidores cerrados correctamente')
    } catch (error) {
      console.error('Error durante el cierre:', error)
      throw error
    }
  }
}


//Función principal del servidor
async function main(): Promise<void> {
  try {
    const config = Config.getInstance()
    const server = new HybridMCPServerRefactored()


    console.log(`Servidor: ${config.serverConfig.name} v${config.serverConfig.version}`)

    // Configurar manejo de señales de terminación
    const gracefulShutdown = async (signal: string) => {
      console.log(`\nRecibida señal ${signal}. Cerrando servidor...`)
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      console.error('Excepción no capturada:', error)
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Promesa rechazada no manejada:', reason)
      process.exit(1)
    })

    // Ejecutando el servidor hibrido
    await server.runHybrid()
   
  } catch (error) {
    console.error('Error fatal:', error)
    process.exit(1)
  }
}

// Ejecutar el servidor
main().catch((error) => {
  console.error('Error fatal:', error)
  process.exit(1)
})
