import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { LogsService } from '../db/LogsService'
import { MCPHandlers } from '../handlers/MCPHandlers'
import { ServerConfig } from '../types/server'

export class MCPServer {
  private server: Server
  private handlers: MCPHandlers

  constructor(
    private logService: LogsService,
    private config: ServerConfig
  ) {
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.handlers = new MCPHandlers(logService)
    this.setupHandlers()
    this.setupErrorHandling()
  }

  private setupHandlers(): void {
    // Listar herramientas disponibles
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request, _extra) => {
      return {
        tools: this.handlers.getAvailableTools()
      } as any
    })

    // Ejecutar herramientas (FLUJO REACTIVO)
    this.server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
      try {
        const toolName = request.params.name
        const args = request.params.arguments || {}

        console.log(`[MCP] Ejecutando tool: ${toolName}`, args)

        switch (toolName) {
          // === LOGS QUERIES ===
          case 'read_jenkins_logs':
            return await this.handlers.handleJenkinsLogs(args) as any

          case 'read_api_logs':
            return await this.handlers.handleApiLogs(args) as any

          // === INCIDENT MANAGEMENT ===
          case 'get_active_incidents':
            return await this.handlers.handleActiveIncidents(args) as any

          case 'get_critical_incidents':
            return await this.handlers.handleCriticalIncidents(args) as any

          case 'acknowledge_incident':
            return await this.handlers.handleAcknowledgeIncident(args as any) as any

          case 'resolve_incident':
            return await this.handlers.handleResolveIncident(args as any) as any

          // === STATISTICS & MONITORING ===
          case 'get_incidents_stats':
            return await this.handlers.handleIncidentsStats(args) as any

          case 'get_server_status':
            return await this.handlers.handleServerStatus(args) as any

          // === JENKINS ACTIONS ===
          case 'request_jenkins_restart':
            return await this.handlers.handleRequestJenkinsRestart(args as any) as any

          case 'request_jenkins_rollback':
            return await this.handlers.handleRequestJenkinsRollback(args as any) as any

          case 'get_action_status':
            return await this.handlers.handleGetActionStatus(args as any) as any

          case 'get_actions_stats':
            return await this.handlers.handleGetActionsStats(args) as any

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Tool desconocido: ${toolName}`
            )
        }
      } catch (error) {
        console.error(`[MCP] Error ejecutando tool ${request.params.name}:`, error)

        if (error instanceof McpError) {
          throw error
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Error ejecutando tool: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error)
    }

    process.on('SIGINT', async () => {
      console.log('\n[MCP] Recibida señal SIGINT, cerrando servidor...')
      await this.close()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      console.log('\n[MCP] Recibida señal SIGTERM, cerrando servidor...')
      await this.close()
      process.exit(0)
    })
  }

  public async start(): Promise<void> {
    try {
      console.error('[MCP] Iniciando servidor MCP...')

      const transport = new StdioServerTransport()
      await this.server.connect(transport)

      console.error('[MCP] Servidor MCP conectado exitosamente')
      console.error('[MCP] Tools disponibles:')
      this.handlers.getAvailableTools().forEach(tool => {
        console.error(`[MCP]   - ${tool.name}`)
      })
    } catch (error) {
      console.error('[MCP] Error inicializando servidor MCP:', error)
      throw error
    }
  }

  public async close(): Promise<void> {
    try {
      await this.server.close()
      await this.logService.close()
      console.error('[MCP] Servidor MCP cerrado correctamente')
    } catch (error) {
      console.error('[MCP] Error cerrando servidor MCP:', error)
      throw error
    }
  }
}