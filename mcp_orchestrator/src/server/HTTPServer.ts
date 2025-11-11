import express from 'express'
import { LogsService } from '../db/LogsService'
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

    // CORS si es necesario
    // this.app.use((req, res, next) => {
    //   res.header('Access-Control-Allow-Origin', '*')
    //   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    //   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    //   if (req.method === 'OPTIONS') {
    //     return res.sendStatus(200)
    //   }
    //   next()
    // })
  }

  private setupRoutes(): void {
    // Endpoint raíz
    this.app.get('/', (req, res) => {
      res.json({
        service: this.config.name,
        version: this.config.version,
        status: 'running',
        pattern: 'Transactional Outbox',
        documentation: '/info'
      })
    })

    // Health check
    this.app.get('/health', (req, res) => {
      this.handlers.handleHealthCheck(req, res)
    })

    // Server info
    this.app.get('/info', (req, res) => {
      this.handlers.handleServerInfo(req, res)
    })

    // Outbox statistics
    // this.app.get('/outbox/stats', (req, res) => {
    //   this.handlers.handleOutboxStats(req, res)
    // })

    // Endpoints para recibir logs
    this.app.post('/mcp/logs/jenkins', (req, res) => {
      this.handlers.handleJenkinsLogs(req, res)
    })

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
      console.log('Iniciando servidor HTTP...')
      await this.logService.initialize()
      console.log('Base de datos inicializada correctamente')

      await new Promise<void>((resolve, reject) => {
        this.app
          .listen(this.config.httpPort, () => {
            console.error(`[HTTP] Servidor HTTP listo en puerto ${this.config.httpPort}`)
            resolve()
          })
          .on('error', (error) => {
            console.error('[HTTP] Error al iniciar servidor HTTP:', error)
            console.log(`Servidor HTTP listo en puerto ${this.config.httpPort}`)
            console.log('Endpoints disponibles:')
            console.log('   GET  /')
            console.log('   GET  /health')
            console.log('   GET  /info')
            console.log('   GET  /outbox/stats')
            console.log('   POST /mcp/logs/jenkins')
            console.log('   POST /mcp/logs/api')
            resolve()
          })
          .on('error', (error) => {
            console.error('Error al iniciar servidor HTTP:', error)
            reject(error)
          })
      })
    } catch (error) {
      console.error('Error inicializando servidor HTTP:', error)
    }
  }
}