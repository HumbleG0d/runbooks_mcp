import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { LogsService } from '../db/LogService'
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
    this.server.setRequestHandler(ListToolsRequestSchema, async (_request, _extra) => {
      return {
        tools: this.handlers.getAvailableTools()
      } as any
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
      try {
        const toolName = request.params.name
        const args = request.params.arguments || {}

        switch (toolName) {
          case 'read_jenkins_logs':
            return await this.handlers.handleJenkinsLogs(args) as any
          case 'read_api_logs':
            return await this.handlers.handleApiLogs(args) as any
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
  }

  public async start(): Promise<void> {
    try {
      console.log('Iniciando servidor MCP...')
      await this.logService.initialize()
      console.log('Base de datos inicializada correctamente')

      const transport = new StdioServerTransport()
      await this.server.connect(transport)
      console.log('Servidor MCP conectado exitosamente')
    } catch (error) {
      console.error('Error inicializando servidor MCP:', error)
      throw error
    }
  }

  public async close(): Promise<void> {
    await this.server.close()
  }
}
