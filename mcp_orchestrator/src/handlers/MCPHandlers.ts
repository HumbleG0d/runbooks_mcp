import { LogsService } from '../db/LogsService'
import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from '../types/types'
import { MCPTool, MCPToolResponse, LogFilter } from '../types/server'

export class MCPHandlers {
  constructor(private logService: LogsService) { }

  public getAvailableTools(): MCPTool[] {
    return [
      {
        name: 'read_jenkins_logs',
        description: 'Leer los logs de Jenkins más recientes',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de logs a retornar',
              minimum: 1,
              maximum: 1000
            },
            level: {
              type: 'string',
              description: 'Filtrar por nivel de log (INFO, WARN, ERROR, DEBUG)',
              enum: ['INFO', 'WARN', 'ERROR', 'DEBUG']
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'read_api_logs',
        description: 'Leer los logs de API más recientes',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de logs a retornar',
              minimum: 1,
              maximum: 1000
            },
            status: {
              type: 'number',
              description: 'Filtrar por código de estado HTTP (200, 404, 500, etc.)',
              minimum: 100,
              maximum: 599
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_server_status',
        description: 'Obtener el estado del servidor y estadísticas',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ]
  }

  public async handleJenkinsLogs(args: LogFilter): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 20, 1000)
      const level = args?.level

      let logs: ResponseToRabbitJenkins[]

      if (level) {
        logs = await this.logService.getLogsJenkinsByLevel(level, limit)
      } else {
        logs = await this.logService.getLogsJenkins(limit)
      }

      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No se encontraron logs de Jenkins${level ? ` con nivel ${level}` : ''}`
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: ResponseToRabbitJenkins) => {
        const timestamp = new Date(log['@timestamp']).toLocaleString()
        const level = log.level || 'INFO'

        return ` ** ${level}** [${timestamp}]\n ${log.message}`
      }).join('\n\n')

      const filterText = level ? ` (filtrado por nivel: ${level})` : ''

      return {
        content: [
          {
            type: 'text',
            text: `Logs de Jenkins (${logs.length} registros)${filterText}\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo logs de Jenkins:', error)
      return {
        content: [
          {
            type: 'text',
            text: `Error obteniendo logs de Jenkins: ${error instanceof Error ? error.message : 'Error desconocido'}`
          }
        ]
      }
    }
  }

  public async handleApiLogs(args: LogFilter): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 20, 1000)
      const status = args?.status

      let logs: ResponseToRabbitAPI[]

      if (status) {
        // Filtrar por status si se proporciona
        const allLogs = await this.logService.getLogsAPI(limit * 2) // Obtener más para filtrar
        logs = allLogs.filter(log => log.http_status === status).slice(0, limit)
      } else {
        logs = await this.logService.getLogsAPI(limit)
      }

      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No se encontraron logs de API${status ? ` con status ${status}` : ''}`
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: ResponseToRabbitAPI) => {
        const timestamp = new Date(log['@timestamp']).toLocaleString()

        return `**${log.http_method} ${log.http_status}** [${timestamp}]\n ${log.message}`
      }).join('\n\n')

      const filterText = status ? ` (filtrado por status: ${status})` : ''

      return {
        content: [
          {
            type: 'text',
            text: `Logs de API (${logs.length} registros)${filterText}\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo logs de API:', error)
      return {
        content: [
          {
            type: 'text',
            text: `Error obteniendo logs de API: ${error instanceof Error ? error.message : 'Error desconocido'}`
          }
        ]
      }
    }
  }
}
