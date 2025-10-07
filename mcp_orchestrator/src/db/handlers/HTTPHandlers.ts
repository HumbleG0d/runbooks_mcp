import { Request, Response } from 'express'
import { LogsService } from '../db/LogService'
import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from '../types/types'

export class HTTPHandlers {
  constructor(
    private logService: LogsService,
    private serverName: string,
    private serverVersion: string,
    private httpPort: number
  ) {}

  public async handleJenkinsLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = Array.isArray(req.body) ? req.body : [req.body]
      const count = await this.logService.insertLogsJenkins(logs as ResponseToRabbitJenkins[])
      
      res.status(200).json({
        success: true,
        message: `${count} logs de Jenkins guardados`,
        target: 'jenkins'
      })
    } catch (error) {
      console.error('[HTTP] Error guardando logs de Jenkins:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      })
    }
  }

  public async handleApiLogs(req: Request, res: Response): Promise<void> {
    try {
      const logs = Array.isArray(req.body) ? req.body : [req.body]
      const count = await this.logService.insertLogsAPI(logs as ResponseToRabbitAPI[])
      
      res.status(200).json({
        success: true,
        message: `${count} logs de API guardados`,
        target: 'api'
      })
    } catch (error) {
      console.error('[HTTP] Error guardando logs de API:', error)
      res.status(500).json({
        success: false,
        error: 'Error interno del servidor',
        message: error instanceof Error ? error.message : 'Error desconocido'
      })
    }
  }

  public async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const [jenkinsLogs, apiLogs] = await Promise.all([
        this.logService.getLogsJenkins(1),
        this.logService.getLogsAPI(1)
      ])

      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: {
          name: this.serverName,
          version: this.serverVersion,
          uptime: process.uptime()
        },
        services: {
          mcp: 'running',
          http: 'running',
          database: 'connected'
        },
        data: {
          jenkins_logs_available: jenkinsLogs.length > 0,
          api_logs_available: apiLogs.length > 0
        }
      })
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Error desconocido'
      })
    }
  }

  public handleServerInfo(req: Request, res: Response): void {
    res.json({
      name: this.serverName,
      version: this.serverVersion,
      description: 'Servidor Híbrido MCP para gestión de logs',
      endpoints: {
        jenkins_logs: 'POST /mcp/logs/jenkins',
        api_logs: 'POST /mcp/logs/api'
      },
      mcp_tools: [
        'read_jenkins_logs',
        'read_api_logs'
      ]
    })
  }

  public handleNotFound(req: Request, res: Response): void {
    res.status(404).json({
      error: 'Endpoint no encontrado',
      path: req.originalUrl,
      method: req.method,
      available_endpoints: ['/mcp/logs/jenkins', '/mcp/logs/api']
    })
  }
}
