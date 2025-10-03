import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from "../types/types";

export async function handleLogJenkinsMCP(
  logs: ResponseToRabbitJenkins | ResponseToRabbitJenkins[]
): Promise<void> {
  try {
    // Asegurar que siempre sea un array
    const logsArray = Array.isArray(logs) ? logs : [logs];

    const mcpUrl = process.env.MCP_URL || 'http://localhost:3222';
    const response = await fetch(`${mcpUrl}/mcp/logs/jenkins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logsArray),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} - ${response.statusText}: ${errorText}`
      );
    }

    const result = await response.json() as { count?: number };
    console.log(`${result.count || logsArray.length} logs de Jenkins enviados al MCP`);

  } catch (error) {
    console.error('Error al enviar logs de Jenkins al MCP:', error);
    // No re-lanzamos el error para evitar que crashee el consumer
    console.log('Continuando con el procesamiento de mensajes...');
  }
}


export async function handleLogAPIMCP(
  logs: ResponseToRabbitAPI | ResponseToRabbitAPI[]
): Promise<void> {
  try {
    // Asegurar que siempre sea un array
    const logsArray = Array.isArray(logs) ? logs : [logs];

    const mcpUrl = process.env.MCP_URL || 'http://localhost:3222';
    const response = await fetch(`${mcpUrl}/mcp/logs/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logsArray),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} - ${response.statusText}: ${errorText}`
      );
    }

    const result = await response.json() as { count?: number };
    console.log(`${result.count || logsArray.length} logs de API enviados al MCP`);

  } catch (error) {
    console.error('Error al enviar logs de API al MCP:', error);
    // No re-lanzamos el error para evitar que crashee el consumer
    console.log('Continuando con el procesamiento de mensajes...');
  }
}
