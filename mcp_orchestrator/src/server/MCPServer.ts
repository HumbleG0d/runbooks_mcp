import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { IMCPServers } from './IMCPServer'
import express from 'express'
import { createMCPRouter } from '../api/MCPApi'
import { LogsService } from '../db/LogService'
import { ToolResponse } from '../types/types'

export class MCPServer implements IMCPServers {

    private server!: McpServer
    private app: express.Application
    private readonly PORT: number = 4000
    private logService: LogsService

    constructor() {
        this.app = express()
        this.app.use(express.json())
        this.logService = new LogsService()
        this.initializeServer()
    }

    private initializeServer(): void {
        this.server = new McpServer({
            name: 'mcp-mtt',
            version: '1.0.0'
        })
    }

    getServer(): McpServer {
        return this.server
    }

    getLogService(): LogsService {
        return this.logService
    }


    registerTools = (): void => {
        this.server.registerTool(
            'read_jenkins_logs',
            {
                title: 'read logs jenkis',
                description: 'Leer todos los logs de jenkins',
                inputSchema: {}
            },
            async () => await this.handleShowLogsJenkis()
        )

        this.server.registerTool(
            'read_api_metric',
            {
                title: 'read metrics api',
                description: 'Leer todas las metricas de la api',
                inputSchema: {}
            },
            async () => await this.handleShowLogsAPI()
        )
    }



    async handleShowLogsJenkis(): Promise<ToolResponse> {
        try {
            const data = await this.logService.getLogsJenkins()
            return {
                content: [
                    {
                        type: 'text',
                        text: `Repositories found: ${JSON.stringify(data, null, 2)}`,
                    },
                ],
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                    },
                ],
            }
        }
    }

    async handleShowLogsAPI(): Promise<ToolResponse> {
        try {
            const data = await this.logService.getLogsAPI()
            return {
                content: [
                    {
                        type: 'text',
                        text: `Repositories found: ${JSON.stringify(data, null, 2)}`,
                    },
                ],
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                    },
                ],
            }
        }
    }


    private setupRoutes(): void {
        const mcpRouter = createMCPRouter(this)
        this.app.use('/mcp', mcpRouter)
    }

    async setupServer(): Promise<void> {
        try {

            //Inciamos el servidor

            await this.logService.initialize()

            //Registramos las herramientas
            this.registerTools()

            //Configuramos las rutas
            this.setupRoutes()

            this.app.listen(this.PORT)

            await new Promise<void>((resolve, reject) => {
                this.app.listen(this.PORT, () => {
                    console.log(`Servidor MCP listo en puerto ${this.PORT}`);
                    resolve();
                }).on('error', (error) => {
                    console.error('Error al iniciar servidor:', error);
                    reject(error);
                })
            })

        } catch (error) {
            console.error('Error en setupServer:', error);
            throw error;
        }
    }
}