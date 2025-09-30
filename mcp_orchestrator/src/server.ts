import { MCPServer } from "./server/MCPServer";

async function start() {
    const mcp_server = new MCPServer()
    await mcp_server.setupServer()
}

start()