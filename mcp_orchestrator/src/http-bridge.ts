// HTTP Bridge para exponer MCP como REST API
// Permite que Ollama (u otros LLMs) consuman las herramientas del MCP

import express from 'express'
import { LogsService } from './db/LogsService'
import { MCPHandlers } from './handlers/MCPHandlers'

const app = express()
app.use(express.json())

// LogsService maneja su propia conexión a PostgreSQL via Config
const logService = new LogsService()
const mcpHandlers = new MCPHandlers(logService)

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'MCP HTTP Bridge' })
})

// ===== INCIDENT MANAGEMENT =====

app.get('/api/incidents/active', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20
        const result = await mcpHandlers.handleActiveIncidents({ limit })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.get('/api/incidents/critical', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10
        const result = await mcpHandlers.handleCriticalIncidents({ limit })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.post('/api/incidents/:id/acknowledge', async (req, res) => {
    try {
        const incident_id = parseInt(req.params.id)
        const { user } = req.body
        const result = await mcpHandlers.handleAcknowledgeIncident({ incident_id, user })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.post('/api/incidents/:id/resolve', async (req, res) => {
    try {
        const incident_id = parseInt(req.params.id)
        const { user, notes } = req.body
        const result = await mcpHandlers.handleResolveIncident({ incident_id, user, notes })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

// NEW: Resolve incident by job and build (called by ActionExecutor after successful action)
app.post('/api/incidents/resolve-by-job', async (req, res) => {
    try {
        const { job_name, build_number, resolution_method, resolved_by } = req.body
        const result = await mcpHandlers.handleResolveIncidentByJob({
            job_name,
            build_number,
            resolution_method,
            resolved_by
        })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.get('/api/incidents/stats', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours as string) || 24
        const result = await mcpHandlers.handleIncidentsStats({ hours })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

// ===== JENKINS ACTIONS =====

app.post('/api/jenkins/restart', async (req, res) => {
    try {
        const { job, build, incident_id, reason } = req.body
        const result = await mcpHandlers.handleRequestJenkinsRestart({
            job,
            build,
            incident_id,
            reason
        })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.post('/api/jenkins/rollback', async (req, res) => {
    try {
        const { job, target_build, incident_id, reason } = req.body
        const result = await mcpHandlers.handleRequestJenkinsRollback({
            job,
            target_build,
            incident_id,
            reason
        })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.get('/api/actions/:id', async (req, res) => {
    try {
        const action_id = parseInt(req.params.id)
        const result = await mcpHandlers.handleGetActionStatus({ action_id })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.get('/api/actions/stats', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours as string) || 24
        const result = await mcpHandlers.handleGetActionsStats({ hours })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

// ===== LOGS =====

app.get('/api/logs/jenkins', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20
        const level = req.query.level as string
        const result = await mcpHandlers.handleJenkinsLogs({ limit, level })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

app.get('/api/logs/api', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 20
        const status = req.query.status ? parseInt(req.query.status as string) : undefined
        const result = await mcpHandlers.handleApiLogs({ limit, status })
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

// ===== SERVER STATUS =====

app.get('/api/status', async (req, res) => {
    try {
        const result = await mcpHandlers.handleServerStatus({})
        res.json({ success: true, data: result })
    } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message })
    }
})

// ===== TOOLS METADATA (para que Ollama sepa qué herramientas hay) =====

app.get('/api/tools', (req, res) => {
    res.json({
        tools: [
            {
                name: 'get_active_incidents',
                description: 'Obtiene lista de incidentes activos (no resueltos)',
                parameters: {
                    limit: { type: 'number', description: 'Número máximo de incidentes', default: 20 }
                }
            },
            {
                name: 'get_critical_incidents',
                description: 'Obtiene solo incidentes críticos y de alta prioridad',
                parameters: {
                    limit: { type: 'number', description: 'Número máximo de incidentes', default: 10 }
                }
            },
            {
                name: 'acknowledge_incident',
                description: 'Marca un incidente como reconocido',
                parameters: {
                    incident_id: { type: 'number', required: true },
                    user: { type: 'string', required: true }
                }
            },
            {
                name: 'resolve_incident',
                description: 'Marca un incidente como resuelto',
                parameters: {
                    incident_id: { type: 'number', required: true },
                    user: { type: 'string', required: true },
                    notes: { type: 'string' }
                }
            },
            {
                name: 'request_jenkins_restart',
                description: 'Solicita reiniciar un build de Jenkins',
                parameters: {
                    job: { type: 'string', required: true },
                    build: { type: 'number', required: true },
                    reason: { type: 'string' }
                }
            },
            {
                name: 'request_jenkins_rollback',
                description: 'Solicita hacer rollback a un build anterior de Jenkins',
                parameters: {
                    job: { type: 'string', required: true },
                    target_build: { type: 'number', required: true },
                    reason: { type: 'string' }
                }
            },
            {
                name: 'get_action_status',
                description: 'Consulta el estado de una acción solicitada',
                parameters: {
                    action_id: { type: 'number', required: true }
                }
            },
            {
                name: 'get_server_status',
                description: 'Obtiene estado general del servidor',
                parameters: {}
            }
        ]
    })
})

// Iniciar servidor
const PORT = process.env.HTTP_BRIDGE_PORT || 3001

    // Inicializar LogsService y luego iniciar el servidor
    ; (async () => {
        try {
            console.error('🔄 Inicializando LogsService...')
            await logService.initialize()
            console.error('✅ LogsService inicializado correctamente')

            app.listen(PORT, () => {
                console.error(`🌉 HTTP Bridge corriendo en http://localhost:${PORT}`)
                console.error(`📚 Herramientas disponibles en http://localhost:${PORT}/api/tools`)
                console.error(`❤️  Health check en http://localhost:${PORT}/health`)
            })
        } catch (error) {
            console.error('❌ Error inicializando HTTP Bridge:', error)
            process.exit(1)
        }
    })()
