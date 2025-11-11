// ============================================
// PROTECCIÓN AGRESIVA DE STDOUT - DEBE SER LO PRIMERO
// ============================================
const mcpMode = process.env.MCP_MODE || ''
const argMode = process.env.MCP_MODE === "hybrid"
const runningOnStdio = argMode || !process.stdout.isTTY || mcpMode.toLowerCase().includes('stdio') || mcpMode.toLowerCase().includes('hybrid')

if (runningOnStdio) {
  // Redirigir console.log y console.info
  console.log = (...args: any[]) => console.error('[LOG]', ...args)
  console.info = (...args: any[]) => console.error('[INFO]', ...args)

  // BLOQUEAR process.stdout.write directamente
  const originalWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = function (chunk: any, encodingOrCb?: any, cb?: any): boolean {
    // Determinar encoding y callback
    const encoding = typeof encodingOrCb === 'string' ? encodingOrCb : undefined
    const callback = typeof encodingOrCb === 'function' ? encodingOrCb : cb

    // Redirigir a stderr
    if (typeof chunk === 'string' && chunk.trim()) {
      // Solo redirigir si NO es un mensaje JSON-RPC
      if (!chunk.includes('"jsonrpc"') && !chunk.includes('"method"')) {
        if (encoding) {
          process.stderr.write(`[STDOUT→STDERR] ${chunk}`, encoding as BufferEncoding)
        } else {
          process.stderr.write(`[STDOUT→STDERR] ${chunk}`)
        }
      }
    }

    if (callback) callback()
    return true
  }

  console.error('[BOOTSTRAP] Stdout protegido - modo MCP activo')
}

// ============================================
// AHORA SÍ, IMPORTS
// ============================================
import { LogsService } from './db/LogService'
import { Config } from './config/Config'
import { HTTPServer } from './server/HTTPServer'
import { MCPServer } from './server/MCPServer'

export class HybridMCPServerRefactored {
  private logService: LogsService
  private config: Config
  private mcpServer?: MCPServer
  private httpServer?: HTTPServer
  private isRunning: boolean = false
  constructor() {
    this.config = Config.getInstance()
    this.logService = new LogsService()
  }

  // hybrid_server.ts (Método runHybrid)

  public async runHybrid(): Promise<void> {
    if (this.isRunning) {
      console.error('[MCP] El servidor MCP ya esta corriendo')
      return
    }
    this.isRunning = true

    try {
      console.error('[MCP] Inicializando servidores...')

      // Inicializar la base de datos UNA SOLA VEZ
      //await this.logService.initialize()

      // Iniciar servidor MCP (stdio) - CRÍTICO, debe funcionar
      this.mcpServer = new MCPServer(this.logService, this.config.serverConfig)
      await this.mcpServer.start()
      console.error('[MCP] ✓ Servidor MCP iniciado')

      // ------------------------------------------------------------------
      // ELIMINAR O COMENTAR ESTE BLOQUE
      /*
      try {
          this.httpServer = new HTTPServer(this.logService, this.config.serverConfig)
          await this.httpServer.start()
          console.error('[HYBRID] ✓ Servidor HTTP iniciado')
          console.error(`[HYBRID] - HTTP: Puerto ${this.config.serverConfig.httpPort}`)
      } catch (httpError) {
          console.error('[HYBRID] ⚠ Servidor HTTP no disponible:', httpError instanceof Error ? httpError.message : String(httpError))
          console.error('[HYBRID] - MCP seguirá funcionando sin HTTP')
      }
      */
      // ------------------------------------------------------------------

      console.error('[MCP] Modo híbrido activado:')
      console.error('[MCP] - MCP: Conexión stdio activa')

      // Mantener el proceso vivo
      process.stdin.resume()
    } catch (error) {
      console.error('[MCP] Error inicializando servidor MCP:', error)
      throw error
    }
  }

  public async close(): Promise<void> {
    console.error('[HYBRID] Cerrando servidores...')

    try {
      if (this.mcpServer) {
        await this.mcpServer.close()
      }

      // await this.logService.close()
      console.error('[HYBRID] Servidores cerrados correctamente')
    } catch (error) {
      console.error('[HYBRID] Error durante el cierre:', error)
      throw error
    }
  }
}

async function main(): Promise<void> {
  try {
    // const config = Config.getInstance()
    const server = new HybridMCPServerRefactored()

    // console.error(`[MAIN] Servidor: ${config.serverConfig.name} v${config.serverConfig.version}`)

    // Configurar manejo de señales de terminación
    const gracefulShutdown = async (signal: string) => {
      console.error(`[MAIN] Recibida señal ${signal}. Cerrando servidor...`)
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

    // Manejo de errores no capturados
    process.on('uncaughtException', (error) => {
      console.error('[MAIN] Excepción no capturada:', error)
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MAIN] Promesa rechazada no manejada:', reason)
      process.exit(1)
    })

    // Ejecutando el servidor híbrido
    await server.runHybrid()

  } catch (error) {
    console.error('[MAIN] Error fatal:', error)
    process.exit(1)
  }
}

// Ejecutar el servidor
main().catch((error) => {
  console.error('[MAIN] Error fatal al iniciar:', error)
  process.exit(1)
})