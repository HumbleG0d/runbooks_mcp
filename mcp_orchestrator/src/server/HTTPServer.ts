import express from 'express'
import { LogsService } from '../db/LogService'
import { HTTPHandlers } from '../handlers/HTTPHandlers'
import { ServerConfig } from '../types/server'

export class HTTPServer {
  private app: express.Application
  private handlers: HTTPHandlers

  constructor(
    private logService: LogsService,
    private config: ServerConfig
  ) {
    this.app = express()
    this.handlers = new HTTPHandlers(
      logService,
      config.name,
      config.version,
      config.httpPort
    )

    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true }))

    // Middleware de logging
    this.app.use((req, res, next) => {
      console.log(`[HTTP] ${req.method} ${req.path} - ${new Date().toISOString()}`)
      next()
    })
  }

  private setupRoutes(): void {
    // Endpoint para recibir logs de Jenkins
    this.app.post('/mcp/logs/jenkins', (req, res) => {
      this.handlers.handleJenkinsLogs(req, res)
    })

    // Endpoint para recibir logs de API
    this.app.post('/mcp/logs/api', (req, res) => {
      this.handlers.handleApiLogs(req, res)
    })


    // Middleware para rutas no encontradas
    this.app.use((req, res) => {
      this.handlers.handleNotFound(req, res)
    })
  }

  public async start(): Promise<void> {
    try {
      console.error('[HTTP] Iniciando servidor HTTP...')
      // ELIMINAR: await this.logService.initialize() // Ya se inicializa en hybrid_server

      await new Promise<void>((resolve, reject) => {
        this.app
          .listen(this.config.httpPort, () => {
            console.error(`[HTTP] Servidor HTTP listo en puerto ${this.config.httpPort}`)
            resolve()
          })
          .on('error', (error) => {
            console.error('[HTTP] Error al iniciar servidor HTTP:', error)
            reject(error)
          })
      })
    } catch (error) {
      console.error('[HTTP] Error inicializando servidor HTTP:', error)
      // NO lanzar la excepción - permitir que el proceso continúe sin HTTP
    }
  }
}
