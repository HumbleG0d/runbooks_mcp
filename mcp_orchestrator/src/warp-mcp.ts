#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { LogsService } from './db/LogService.js'

class WarpMCPServer {
  private server: Server
  private logService: LogsService

  constructor() {
    this.server = new Server(
      {
        name: 'runbooks-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.logService = new LogsService()
    this.setupToolHandlers()
    this.setupErrorHandling()
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'read_jenkins_logs',
            description: 'Leer los logs de Jenkins más recientes',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Número máximo de logs a retornar',
                  default: 20
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
                  default: 20
                }
              },
              additionalProperties: false
            }
          }
        ]
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'read_jenkins_logs':
            return await this.handleReadJenkinsLogs(request.params.arguments)
          case 'read_api_logs':
            return await this.handleReadApiLogs(request.params.arguments)
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Tool desconocido: ${request.params.name}`
            )
        }
      } catch (error) {
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

  private async handleReadJenkinsLogs(args: any) {
    try {
      const limit = args?.limit || 20
      const logs = await this.logService.getLogsJenkins(limit)
      
      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '📭 No se encontraron logs de Jenkins'
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: any) => 
        `🔸 **${log.level || 'INFO'}** [${new Date(log['@timestamp']).toLocaleString()}]\n   📝 ${log.message}`
      ).join('\n\n')

      return {
        content: [
          {
            type: 'text',
            text: `# 🔧 Logs de Jenkins (${logs.length} registros)\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error obteniendo logs de Jenkins: ${error instanceof Error ? error.message : 'Error desconocido'}`
          }
        ]
      }
    }
  }

  private async handleReadApiLogs(args: any) {
    try {
      const limit = args?.limit || 20
      const logs = await this.logService.getLogsAPI(limit)
      
      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '📭 No se encontraron logs de API'
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: any) => 
        `🔸 **${log.http_method} ${log.http_status}** [${new Date(log['@timestamp']).toLocaleString()}]\n   📝 ${log.message}`
      ).join('\n\n')

      return {
        content: [
          {
            type: 'text',
            text: `# 🌐 Logs de API (${logs.length} registros)\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error obteniendo logs de API: ${error instanceof Error ? error.message : 'Error desconocido'}`
          }
        ]
      }
    }
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error)
    }

    process.on('SIGINT', async () => {
      await this.server.close()
      await this.logService.close()
      process.exit(0)
    })
  }

  async run() {
    try {
      await this.logService.initialize()
      console.error('✅ Base de datos inicializada correctamente')

      const transport = new StdioServerTransport()
      await this.server.connect(transport)
      console.error('🚀 Servidor MCP para Warp conectado exitosamente')
    } catch (error) {
      console.error('❌ Error inicializando servidor MCP:', error)
      process.exit(1)
    }
  }
}

async function main() {
  const server = new WarpMCPServer()
  await server.run()
}

main().catch((error) => {
  console.error('💥 Error fatal:', error)
  process.exit(1)
})