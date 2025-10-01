import { Router } from 'express'
import { MCPServer } from '../server/MCPServer'

export function createMCPRouter(mcpServer: MCPServer) {
  const router = Router()
  const logsService = mcpServer.getLogService()

  router.post('/logs/:target', async (req, res) => {
    try {
      const { target } = req.params
      const logs = Array.isArray(req.body) ? req.body : [req.body]

      let count: number

      if (target === 'jenkins') {
        count = await logsService.insertLogsJenkins(logs)
      } else if (target === 'api') {
        count = await logsService.insertLogsAPI(logs)
      } else {
        return res.status(400).json({
          error: `Target no soportado: ${target}`,
        })
      }

      return res.status(200).json({
        success: true,
        message: `${count} logs guardados`,
        target,
      })
    } catch (err) {
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
  })

  router.get('/mcp', async (req, res) => {
    console.log('Received GET MCP request')
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      })
    )
  })

  router.delete('/mcp', async (req, res) => {
    console.log('Received GET MCP request')
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      })
    )
  })
  return router
}
