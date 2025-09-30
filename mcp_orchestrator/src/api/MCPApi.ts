import { Router } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { MCPServer } from '../server/MCPServer'

export function createMCPRouter(mcpServer: MCPServer) {
    const router = Router();

    router.post('/mcp', async (req, res) => {
        try {
            const server = mcpServer.getServer()

            const trasnport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            })
            res.on('close', () => {
                console.log('Request Closed')
                trasnport.close()
                server.close()
            })

            //Pasar el json obtenido

            await server.connect(trasnport)
            await trasnport.handleRequest(req, res, req.body)
        } catch (error) {
            console.log('Error handling MCP request:', error)
            if (!res.hasHeader) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error',
                    },
                    id: null,
                })
            }
        }
    });

    router.get('/mcp', async (req, res) => {
        console.log('Received GET MCP request')
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Method not allowed."
            },
            id: null
        }))
    })

    router.delete('/mcp', async (req, res) => {
        console.log('Received GET MCP request')
        res.writeHead(405).end(JSON.stringify({
            jsonrpc: "2.0",
            error: {
                code: -32000,
                message: "Method not allowed."
            },
            id: null
        }))
    })
    return router
}