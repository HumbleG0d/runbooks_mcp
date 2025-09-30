import axios from "axios";

export async function handleLogMCP(log: JSON): Promise<void> {
    try {
        await axios.post("http://localhost:4000/mcp/analyze", log)
    } catch (error) {
        console.error("Error al enviar el log al MCP:", error)
    }
}