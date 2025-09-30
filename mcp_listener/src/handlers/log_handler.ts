import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from "../types/types";

export async function handleLogJenkinsMCP(
  logs: ResponseToRabbitJenkins | ResponseToRabbitJenkins[]
): Promise<void> {
  try {
    // Asegurar que siempre sea un array
    const logsArray = Array.isArray(logs) ? logs : [logs];

    const response = await fetch('http://localhost:4000/logs/jenkins', {
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

    const result = await response.json();
    console.log(`${result.count || logsArray.length} logs de Jenkins enviados al MCP`);

  } catch (error) {
    console.error('Error al enviar logs de Jenkins al MCP:', error);
    throw error; //  Re-lanza el error para que RabbitMQ lo maneje
  }
}


export async function handleLogAPIMCP(
  logs: ResponseToRabbitAPI | ResponseToRabbitAPI[]
): Promise<void> {
  try {
    // Asegurar que siempre sea un array
    const logsArray = Array.isArray(logs) ? logs : [logs];

    const response = await fetch('http://localhost:4000/logs/api', {
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

    const result = await response.json();
    console.log(`${result.count || logsArray.length} logs de API enviados al MCP`);

  } catch (error) {
    console.error('Error al enviar logs de API al MCP:', error);
    throw error; // Re-lanza el error para que RabbitMQ lo maneje
  }
}