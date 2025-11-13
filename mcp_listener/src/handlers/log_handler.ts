import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from "../types/types";
import { lastSentStore } from "../state/LastSentStore";

export async function handleLogJenkinsMCP(
  logs: ResponseToRabbitJenkins | ResponseToRabbitJenkins[]
): Promise<void> {
  try {
    // Asegurar que siempre sea un array
    const logsArray = Array.isArray(logs) ? logs : [logs];

    // Filtrar logs que ya fueron enviados según '@timestamp'
    const toSend: ResponseToRabbitJenkins[] = []
    const perIndexMax: Record<string, number> = {}

    for (const l of logsArray) {
      const key = l._index || 'jenkins'
      const rawTs = (l as any)['@timestamp']
      const ts = parseTimestamp(rawTs)
      const last = await lastSentStore.get(key)
      if (ts > last) {
        toSend.push(l)
        perIndexMax[key] = Math.max(perIndexMax[key] || 0, ts)
      }
    }

    if (toSend.length === 0) {
      console.error('No hay logs nuevos de Jenkins para enviar')
      return
    }

    const mcpUrl = process.env.MCP_URL || 'http://localhost:3222'
    const response = await fetch(`${mcpUrl}/mcp/logs/jenkins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toSend),
    })

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} - ${response.statusText}: ${errorText}`
      );
    }

    const result = await response.json() as { count?: number };
    console.log(`${result.count || toSend.length} logs de Jenkins enviados al MCP`);

    // Actualizar último timestamp enviado por índice
    for (const key of Object.keys(perIndexMax)) {
      await lastSentStore.updateMax(key, perIndexMax[key])
    }

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

    // Filtrar logs que ya fueron enviados según '@timestamp'
    const toSend: ResponseToRabbitAPI[] = []
    const perIndexMax: Record<string, number> = {}

    for (const l of logsArray) {
      const key = (l as any)._index || 'api'
      const rawTs = (l as any)['@timestamp']
      const ts = parseTimestamp(rawTs)
      const last = await lastSentStore.get(key)
      if (ts > last) {
        toSend.push(l)
        perIndexMax[key] = Math.max(perIndexMax[key] || 0, ts)
      }
    }

    if (toSend.length === 0) {
      console.error('No hay logs nuevos de API para enviar')
      return
    }

    const mcpUrl = process.env.MCP_URL || 'http://localhost:3222'
    const response = await fetch(`${mcpUrl}/mcp/logs/api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(toSend),
    })

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `HTTP ${response.status} - ${response.statusText}: ${errorText}`
      );
    }

    const result = await response.json() as { count?: number };
    console.log(`${result.count || toSend.length} logs de API enviados al MCP`);

    // Actualizar último timestamp enviado por índice
    for (const key of Object.keys(perIndexMax)) {
      await lastSentStore.updateMax(key, perIndexMax[key])
    }

  } catch (error) {
    console.error('Error al enviar logs de API al MCP:', error);
    // No re-lanzamos el error para evitar que crashee el consumer
    console.log('Continuando con el procesamiento de mensajes...');
  }
}

function parseTimestamp(raw: any): number {
  if (!raw) return 0
  if (typeof raw === 'number') return raw
  if (raw instanceof Date) return raw.getTime()
  // Try parse string
  const parsed = Date.parse(String(raw))
  if (!isNaN(parsed)) return parsed
  // fallback: 0
  return 0
}
