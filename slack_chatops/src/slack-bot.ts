// Slack ChatOps Bot con Ollama + MCP
// Bot gratuito que usa Ollama local para procesar comandos de Slack

import { App } from '@slack/bolt';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Configuración
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MCP_BRIDGE_URL = process.env.MCP_BRIDGE_URL || 'http://localhost:3001';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'tinyllama';

// Validar variables de entorno requeridas
if (!process.env.SLACK_BOT_TOKEN) {
    throw new Error('SLACK_BOT_TOKEN no está configurado en .env');
}
if (!process.env.SLACK_SIGNING_SECRET) {
    throw new Error('SLACK_SIGNING_SECRET no está configurado en .env');
}
if (!process.env.SLACK_APP_TOKEN) {
    throw new Error('SLACK_APP_TOKEN no está configurado en .env');
}

// Inicializar Slack App
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
});

// System prompt para el bot
const SYSTEM_PROMPT = `Eres un asistente de DevOps que ayuda a gestionar incidentes y ejecutar acciones en Jenkins.

Tienes acceso a las siguientes herramientas:

1. get_active_incidents - Obtiene incidentes activos
2. get_critical_incidents - Obtiene incidentes críticos
3. acknowledge_incident - Marca un incidente como reconocido
4. resolve_incident - Marca un incidente como resuelto
5. request_jenkins_restart - Reinicia un build de Jenkins
6. request_jenkins_rollback - Hace rollback a un build anterior
7. get_action_status - Consulta el estado de una acción
8. get_server_status - Obtiene el estado del servidor

Cuando el usuario te pida algo, analiza qué herramienta necesitas usar y responde en formato JSON:
{
  "tool": "nombre_de_la_herramienta",
  "parameters": { ... },
  "explanation": "explicación breve de lo que vas a hacer"
}

Si no necesitas usar ninguna herramienta, responde normalmente.

Sé conciso y profesional. Usa emojis cuando sea apropiado.`;

// Función para llamar a Ollama
async function callOllama(userMessage: string, conversationHistory: any[] = []) {
    try {
        const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
            model: OLLAMA_MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...conversationHistory,
                { role: 'user', content: userMessage }
            ],
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9,
            }
        });

        return response.data.message.content;
    } catch (error) {
        console.error('Error llamando a Ollama:', error);
        throw error;
    }
}

// Función para ejecutar herramientas del MCP
async function executeTool(toolName: string, parameters: any) {
    const toolMap: Record<string, { method: string, url: string }> = {
        'get_active_incidents': { method: 'GET', url: '/api/incidents/active' },
        'get_critical_incidents': { method: 'GET', url: '/api/incidents/critical' },
        'acknowledge_incident': { method: 'POST', url: `/api/incidents/${parameters.incident_id}/acknowledge` },
        'resolve_incident': { method: 'POST', url: `/api/incidents/${parameters.incident_id}/resolve` },
        'request_jenkins_restart': { method: 'POST', url: '/api/jenkins/restart' },
        'request_jenkins_rollback': { method: 'POST', url: '/api/jenkins/rollback' },
        'get_action_status': { method: 'GET', url: `/api/actions/${parameters.action_id}` },
        'get_server_status': { method: 'GET', url: '/api/status' },
    };

    const tool = toolMap[toolName];
    if (!tool) {
        throw new Error(`Herramienta desconocida: ${toolName}`);
    }

    try {
        const response = await axios({
            method: tool.method,
            url: `${MCP_BRIDGE_URL}${tool.url}`,
            data: tool.method === 'POST' ? parameters : undefined,
            params: tool.method === 'GET' ? parameters : undefined,
        });

        return response.data;
    } catch (error) {
        console.error(`Error ejecutando herramienta ${toolName}:`, error);
        throw error;
    }
}

// Función para procesar el mensaje del usuario
async function processUserMessage(userMessage: string, userId: string) {
    try {
        // Paso 1: Llamar a Ollama para entender la intención
        const ollamaResponse = await callOllama(userMessage);

        console.log('Respuesta de Ollama:', ollamaResponse);

        // Paso 2: Intentar parsear como JSON (si Ollama decidió usar una herramienta)
        let toolCall;
        try {
            // Buscar JSON en la respuesta
            const jsonMatch = ollamaResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                toolCall = JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            // No es JSON, es una respuesta normal
            toolCall = null;
        }

        // Paso 3: Si hay una herramienta que ejecutar, ejecutarla
        if (toolCall && toolCall.tool) {
            const explanation = toolCall.explanation || 'Ejecutando acción...';

            // Ejecutar la herramienta
            const toolResult = await executeTool(toolCall.tool, {
                ...toolCall.parameters,
                user: userId // Agregar el usuario de Slack
            });

            // Formatear la respuesta
            const resultText = JSON.stringify(toolResult.data, null, 2);

            return `${explanation}\n\n\`\`\`\n${resultText}\n\`\`\``;
        }

        // Paso 4: Si no hay herramienta, devolver la respuesta de Ollama directamente
        return ollamaResponse;

    } catch (error) {
        console.error('Error procesando mensaje:', error);
        return `❌ Error: ${(error as Error).message}`;
    }
}

// Escuchar menciones al bot
app.event('app_mention', async ({ event, say }) => {
    try {
        // Remover la mención del bot del mensaje
        const userMessage = event.text.replace(/<@.*?>/, '').trim();
        const userId = event.user || 'unknown';

        // Mostrar que está "escribiendo"
        await say({
            text: '🤔 Pensando...',
            ...(event.ts && { thread_ts: event.ts })
        });

        // Procesar el mensaje
        const response = await processUserMessage(userMessage, userId);

        // Responder en el thread
        await say({
            text: response,
            ...(event.ts && { thread_ts: event.ts })
        });

    } catch (error) {
        console.error('Error en app_mention:', error);
        await say({
            text: `❌ Error procesando tu mensaje: ${(error as Error).message}`,
            ...(event.ts && { thread_ts: event.ts })
        });
    }
});

// Comando slash: /devops
app.command('/devops', async ({ command, ack, say }) => {
    await ack();

    try {
        const userMessage = command.text;
        const userId = command.user_id;

        const response = await processUserMessage(userMessage, userId);

        await say({
            text: response,
            channel: command.channel_id
        });

    } catch (error) {
        console.error('Error en /devops:', error);
        await say({
            text: `❌ Error: ${(error as Error).message}`,
            channel: command.channel_id
        });
    }
});

// Comando de ayuda
app.command('/devops-help', async ({ command, ack, say }) => {
    await ack();

    const helpText = `
🤖 *DevOps ChatOps Bot - Ayuda*

*Comandos disponibles:*

📊 *Incidentes*
• \`/devops muestra incidentes activos\`
• \`/devops muestra incidentes críticos\`
• \`/devops reconoce incidente 123\`
• \`/devops resuelve incidente 123 con nota: problema solucionado\`

🔧 *Jenkins*
• \`/devops reinicia build 45 del job tesis-runbooks\`
• \`/devops rollback del job tesis-runbooks al build 40\`
• \`/devops estado de la acción 5\`

📈 *Monitoreo*
• \`/devops estado del servidor\`
• \`/devops estadísticas de incidentes\`

También puedes mencionar al bot: @devops-bot <tu pregunta>
`;

    await say({
        text: helpText,
        channel: command.channel_id
    });
});

// Iniciar el bot
(async () => {
    try {
        await app.start();
        console.log('⚡️ Slack ChatOps Bot iniciado!');
        console.log(`🤖 Usando modelo Ollama: ${OLLAMA_MODEL}`);
        console.log(`🌉 MCP Bridge: ${MCP_BRIDGE_URL}`);
        console.log(`🦙 Ollama: ${OLLAMA_URL}`);
    } catch (error) {
        console.error('Error iniciando el bot:', error);
        process.exit(1);
    }
})();
