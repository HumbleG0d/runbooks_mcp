#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import express from 'express'
import { createMCPRouter } from './api/MCPApi.js'
import { LogsService } from './db/LogService.js'

class HybridMCPServer {
  private mcpServer: Server
  private httpApp: express.Application
  private logService: LogsService
  private readonly HTTP_PORT = 3222

  constructor() {
    // Servidor MCP para Warp
    this.mcpServer = new Server(
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

    // Servidor HTTP Express para otros clientes
    this.httpApp = express()
    this.httpApp.use(express.json())

    this.logService = new LogsService()
    this.setupMCPHandlers()
    this.setupHTTPRoutes()
    this.setupErrorHandling()
  }

  private setupMCPHandlers() {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
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

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'read_jenkins_logs':
            return await this.handleMCPReadJenkinsLogs(request.params.arguments)
          case 'read_api_logs':
            return await this.handleMCPReadApiLogs(request.params.arguments)
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

  private async handleMCPReadJenkinsLogs(args: any) {
    try {
      const limit = args?.limit || 20
      const logs = await this.logService.getLogsJenkins(limit)

      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No se encontraron logs de Jenkins'
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: any) =>
        `**${log.level || 'INFO'}** [${new Date(log['@timestamp']).toLocaleString()}]\n  ${log.message}\n`
      ).join('\n')

      return {
        content: [
          {
            type: 'text',
            text: `# Logs de Jenkins (${logs.length} registros)\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
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

  private async handleMCPReadApiLogs(args: any) {
    try {
      const limit = args?.limit || 20
      const logs = await this.logService.getLogsAPI(limit)

      if (logs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No se encontraron logs de API'
            }
          ]
        }
      }

      const formattedLogs = logs.map((log: any) =>
        `**${log.http_method} ${log.http_status}** [${new Date(log['@timestamp']).toLocaleString()}]\n   ${log.message}\n`
      ).join('\n')

      return {
        content: [
          {
            type: 'text',
            text: `#Logs de API (${logs.length} registros)\n\n${formattedLogs}`
          }
        ]
      }
    } catch (error) {
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

  private setupHTTPRoutes() {
    // Crear router HTTP usando el existente
    const mcpRouter = createMCPRouter({
      getLogService: () => this.logService
    } as any)

    this.httpApp.use('/mcp', mcpRouter)

    // Endpoint de salud
    this.httpApp.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          mcp: 'running',
          http: 'running',
          database: 'connected'
        }
      })
    })
  }

  private setupErrorHandling() {
    this.mcpServer.onerror = (error) => {
      console.error('[MCP Server Error]', error)
    }

    process.on('SIGINT', async () => {
      console.error('Deteniendo servidor híbrido...')
      await this.mcpServer.close()
      await this.logService.close()
      process.exit(0)
    })
  }

  // Método para ejecutar solo MCP (para Warp)
  async runMCPOnly() {
    try {
      await this.logService.initialize()
      console.error('Base de datos inicializada correctamente')

      const transport = new StdioServerTransport()
      await this.mcpServer.connect(transport)
      console.error('Servidor MCP para Warp conectado exitosamente')
    } catch (error) {
      console.error('Error inicializando servidor MCP:', error)
      process.exit(1)
    }
  }

  // Método para ejecutar solo HTTP (para otros clientes)
  async runHTTPOnly() {
    try {
      await this.logService.initialize()
      console.error('✅ Base de datos inicializada correctamente')

      await new Promise<void>((resolve, reject) => {
        this.httpApp
          .listen(this.HTTP_PORT, () => {
            console.error(`🌐 Servidor HTTP listo en puerto ${this.HTTP_PORT}`)
            resolve()
          })
          .on('error', (error) => {
            console.error('❌ Error al iniciar servidor HTTP:', error)
            reject(error)
          })
      })
    } catch (error) {
      console.error('❌ Error inicializando servidor HTTP:', error)
      process.exit(1)
    }
  }

  // Método para ejecutar ambos (modo híbrido)
  async runHybrid() {
    try {
      await this.logService.initialize()
      console.error('✅ Base de datos inicializada correctamente')

      // Iniciar servidor HTTP
      await new Promise<void>((resolve, reject) => {
        this.httpApp
          .listen(this.HTTP_PORT, () => {
            console.error(`🌐 Servidor HTTP listo en puerto ${this.HTTP_PORT}`)
            resolve()
          })
          .on('error', (error) => {
            console.error('❌ Error al iniciar servidor HTTP:', error)
            reject(error)
          })
      })

      console.error('🔄 Modo híbrido: HTTP ejecutándose, MCP disponible para stdio')

      // Mantener el proceso vivo
      process.stdin.resume()
    } catch (error) {
      console.error('Error inicializando servidor híbrido:', error)
      process.exit(1)
    }
  }
}

async function main() {
  const server = new HybridMCPServer()

  // Detectar modo basado en argumentos o variable de entorno
  const mode = process.argv[2] || process.env.MCP_MODE || 'hybrid'

  switch (mode) {
    case 'mcp':
      await server.runMCPOnly()
      break
    case 'http':
      await server.runHTTPOnly()
      break
    case 'hybrid':
    default:
      await server.runHybrid()
      break
  }
}

main().catch((error) => {
  console.error('💥 Error fatal:', error)
  process.exit(1)
})