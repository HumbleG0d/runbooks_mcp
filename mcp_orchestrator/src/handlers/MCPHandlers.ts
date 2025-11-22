import { LogsService } from '../db/LogsService'
import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from '../types/types'
import { MCPTool, MCPToolResponse, LogFilter } from '../types/server'
import { IncidentSeverity, IncidentStatus } from '../types/incident'

export class MCPHandlers {
  constructor(private logService: LogsService) { }

  /**
   * Define las herramientas disponibles para ChatOps
   */
  public getAvailableTools(): MCPTool[] {
    return [
      // === LOGS QUERIES ===
      {
        name: 'read_jenkins_logs',
        description: 'Lee logs de Jenkins de la base de datos. Soporta filtrado por nivel (ERROR, WARN, INFO) y límite de resultados.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de logs a retornar (1-1000)',
              minimum: 1,
              maximum: 1000,
              default: 20
            },
            level: {
              type: 'string',
              description: 'Filtrar por nivel de log',
              enum: ['INFO', 'WARN', 'ERROR', 'DEBUG']
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'read_api_logs',
        description: 'Lee logs de API de la base de datos. Soporta filtrado por código HTTP y límite de resultados.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de logs a retornar (1-1000)',
              minimum: 1,
              maximum: 1000,
              default: 20
            },
            status: {
              type: 'number',
              description: 'Filtrar por código de estado HTTP (ej: 200, 404, 500)',
              minimum: 100,
              maximum: 599
            }
          },
          additionalProperties: false
        }
      },

      // === INCIDENT MANAGEMENT ===
      {
        name: 'get_active_incidents',
        description: 'Obtiene lista de incidentes activos (no resueltos). Útil para revisar qué está fallando actualmente.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de incidentes (1-100)',
              minimum: 1,
              maximum: 100,
              default: 20
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_critical_incidents',
        description: 'Obtiene solo incidentes críticos y de alta prioridad. Ideal para alertas urgentes.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Número máximo de incidentes (1-50)',
              minimum: 1,
              maximum: 50,
              default: 10
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'acknowledge_incident',
        description: 'Marca un incidente como reconocido (acknowledged). Usa esto cuando comiences a investigar.',
        inputSchema: {
          type: 'object',
          properties: {
            incident_id: {
              type: 'number',
              description: 'ID del incidente a reconocer'
            },
            user: {
              type: 'string',
              description: 'Nombre del usuario que reconoce el incidente'
            }
          },
          required: ['incident_id', 'user'],
          additionalProperties: false
        }
      },
      {
        name: 'resolve_incident',
        description: 'Marca un incidente como resuelto. Incluye notas de resolución.',
        inputSchema: {
          type: 'object',
          properties: {
            incident_id: {
              type: 'number',
              description: 'ID del incidente a resolver'
            },
            user: {
              type: 'string',
              description: 'Nombre del usuario que resuelve'
            },
            notes: {
              type: 'string',
              description: 'Notas sobre cómo se resolvió el incidente'
            }
          },
          required: ['incident_id', 'user'],
          additionalProperties: false
        }
      },

      // === STATISTICS & MONITORING ===
      {
        name: 'get_incidents_stats',
        description: 'Obtiene estadísticas de incidentes: total, por severidad, por estado, MTTR.',
        inputSchema: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: 'Ventana de tiempo en horas (default: 24)',
              minimum: 1,
              maximum: 168,
              default: 24
            }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_server_status',
        description: 'Obtiene estado general del servidor: salud, estadísticas de outbox, incidentes activos.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },

      // === JENKINS ACTIONS (Delegan a Action Runner) ===
      {
        name: 'request_jenkins_restart',
        description: 'Solicita reiniciar un build de Jenkins. La acción se ejecuta de forma asíncrona por el Action Runner.',
        inputSchema: {
          type: 'object',
          properties: {
            job: {
              type: 'string',
              description: 'Nombre del job de Jenkins'
            },
            build: {
              type: 'number',
              description: 'Número del build a reiniciar'
            },
            incident_id: {
              type: 'number',
              description: 'ID del incidente relacionado (opcional)'
            },
            reason: {
              type: 'string',
              description: 'Razón del restart'
            }
          },
          required: ['job', 'build'],
          additionalProperties: false
        }
      },
      {
        name: 'request_jenkins_rollback',
        description: 'Solicita hacer rollback a un build anterior de Jenkins.',
        inputSchema: {
          type: 'object',
          properties: {
            job: {
              type: 'string',
              description: 'Nombre del job de Jenkins'
            },
            target_build: {
              type: 'number',
              description: 'Número del build al que hacer rollback'
            },
            incident_id: {
              type: 'number',
              description: 'ID del incidente relacionado (opcional)'
            },
            reason: {
              type: 'string',
              description: 'Razón del rollback'
            }
          },
          required: ['job', 'target_build'],
          additionalProperties: false
        }
      },
      {
        name: 'get_action_status',
        description: 'Consulta el estado de una acción solicitada.',
        inputSchema: {
          type: 'object',
          properties: {
            action_id: {
              type: 'number',
              description: 'ID de la acción a consultar'
            }
          },
          required: ['action_id'],
          additionalProperties: false
        }
      },
      {
        name: 'get_actions_stats',
        description: 'Obtiene estadísticas de acciones ejecutadas.',
        inputSchema: {
          type: 'object',
          properties: {
            hours: {
              type: 'number',
              description: 'Ventana de tiempo en horas (default: 24)',
              minimum: 1,
              maximum: 168,
              default: 24
            }
          },
          additionalProperties: false
        }
      }
    ]
  }

  // === FLUJO REACTIVO: LOGS QUERIES ===

  public async handleJenkinsLogs(args: LogFilter): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 20, 1000)
      const level = args?.level

      let logs: ResponseToRabbitJenkins[]

      if (level) {
        logs = await this.logService.getLogsJenkinsByLevel(level, limit)
      } else {
        logs = await this.logService.getLogsJenkins(limit)
      }

      if (logs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No se encontraron logs de Jenkins${level ? ` con nivel ${level}` : ''}`
          }]
        }
      }

      const formattedLogs = logs.map((log: ResponseToRabbitJenkins) => {
        const timestamp = new Date(log['@timestamp']).toLocaleString('es-PE', {
          timeZone: 'America/Lima'
        })
        const levelEmoji = this.getLevelEmoji(log.level)

        return `${levelEmoji} **${log.level}** - ${timestamp}\n${log.message.substring(0, 200)}${log.message.length > 200 ? '...' : ''}`
      }).join('\n\n---\n\n')

      const filterText = level ? ` (filtrado por nivel: ${level})` : ''

      return {
        content: [{
          type: 'text',
          text: `Logs de Jenkins (${logs.length} registros)${filterText}\n\n${formattedLogs}`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo logs de Jenkins:', error)
      return {
        content: [{
          type: 'text',
          text: ` Error obteniendo logs de Jenkins: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleApiLogs(args: LogFilter): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 20, 1000)
      const status = args?.status

      let logs: ResponseToRabbitAPI[]

      if (status) {
        const allLogs = await this.logService.getLogsAPI(limit * 2)
        logs = allLogs.filter(log => log.http_status === status).slice(0, limit)
      } else {
        logs = await this.logService.getLogsAPI(limit)
      }

      if (logs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: ` No se encontraron logs de API${status ? ` con status ${status}` : ''}`
          }]
        }
      }

      const formattedLogs = logs.map((log: ResponseToRabbitAPI) => {
        const timestamp = new Date(log['@timestamp']).toLocaleString('es-PE', {
          timeZone: 'America/Lima'
        })
        const statusEmoji = this.getStatusEmoji(log.http_status)

        return `${statusEmoji} **${log.http_method} ${log.http_status}** - ${timestamp}\n${log.message.substring(0, 200)}${log.message.length > 200 ? '...' : ''}`
      }).join('\n\n---\n\n')

      const filterText = status ? ` (filtrado por status: ${status})` : ''

      return {
        content: [{
          type: 'text',
          text: `Logs de API(${logs.length} registros)${filterText}\n\n${formattedLogs}`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo logs de API:', error)
      return {
        content: [{
          type: 'text',
          text: `Error obteniendo logs de API: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  // === FLUJO REACTIVO: INCIDENT MANAGEMENT ===

  public async handleActiveIncidents(args: { limit?: number }): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 20, 100)
      const incidents = await this.logService.getIncidentRepository().getActiveIncidents(limit)

      if (incidents.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No hay incidentes activos. Todo está funcionando correctamente.`
          }]
        }
      }

      const formatted = incidents.map((inc: any) => {
        const emoji = this.getSeverityEmoji(inc.severity)
        const timestamp = new Date(inc.detected_at).toLocaleString('es-PE')
        const details = inc.details

        return `${emoji} **[${inc.severity.toUpperCase()}] ${inc.incident_type}**
 Detectado: ${timestamp}
 Estado: ${inc.status}
 Log ID: ${inc.log_id} (${inc.log_type})
${inc.runbook_url ? ` Runbook: ${inc.runbook_url}` : ''}
${details.message ? ` ${details.message.substring(0, 150)}...` : ''}`
      }).join('\n\n---\n\n')

      return {
        content: [{
          type: 'text',
          text: `Incidentes Activos (${incidents.length} encontrados)\n\n${formatted}`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo incidentes activos:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleCriticalIncidents(args: { limit?: number }): Promise<MCPToolResponse> {
    try {
      const limit = Math.min(args?.limit || 10, 50)

      const [critical, high] = await Promise.all([
        this.logService.getIncidentRepository().getIncidentsBySeverity(IncidentSeverity.CRITICAL, limit),
        this.logService.getIncidentRepository().getIncidentsBySeverity(IncidentSeverity.HIGH, limit)
      ])

      const allCritical = [...critical, ...high].slice(0, limit)

      if (allCritical.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No hay incidentes críticos. Sistema estable.`
          }]
        }
      }

      const formatted = allCritical.map((inc: any) => {
        const emoji = this.getSeverityEmoji(inc.severity)
        const timestamp = new Date(inc.detected_at).toLocaleString('es-PE')

        return `${emoji} [${inc.severity.toUpperCase()}] ${inc.incident_type} (ID: ${inc.id})
 ${timestamp} |  ${inc.status}
${inc.runbook_url ? `Runbook: ${inc.runbook_url}` : ''}
 ${JSON.stringify(inc.details).substring(0, 100)}...`
      }).join('\n\n')

      return {
        content: [{
          type: 'text',
          text: `Incidentes Críticos (${allCritical.length})\n\n${formatted}\n\n Requieren atención inmediata`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo incidentes críticos:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleAcknowledgeIncident(args: { incident_id: number; user: string }): Promise<MCPToolResponse> {
    try {
      await this.logService.getIncidentRepository().updateIncidentStatus(
        args.incident_id,
        IncidentStatus.ACKNOWLEDGED,
        args.user
      )

      return {
        content: [{
          type: 'text',
          text: `Incidente #${args.incident_id} reconocido por ${args.user}. Estado actualizado a 'acknowledged'.`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error reconociendo incidente:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleResolveIncident(args: { incident_id: number; user: string; notes?: string }): Promise<MCPToolResponse> {
    try {
      await this.logService.getIncidentRepository().updateIncidentStatus(
        args.incident_id,
        IncidentStatus.RESOLVED,
        args.user,
        args.notes
      )

      return {
        content: [{
          type: 'text',
          text: `Incidente #${args.incident_id} resuelto por ${args.user}.\n${args.notes ? `Notas: ${args.notes}` : ''}`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error resolviendo incidente:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  // === STATISTICS & MONITORING ===

  public async handleIncidentsStats(args: { hours?: number }): Promise<MCPToolResponse> {
    try {
      const hours = Math.min(args?.hours || 24, 168)
      const stats = await this.logService.getIncidentRepository().getStats(hours)

      const text = `Estadísticas de Incidentes (últimas ${hours}h)

Total: ${stats.total} incidentes

Por Severidad:
🔴 Critical: ${stats.by_severity.critical}
🟠 High: ${stats.by_severity.high}
🟡 Medium: ${stats.by_severity.medium}
🟢 Low: ${stats.by_severity.low}

Por Estado:
🔍 Detected: ${stats.by_status.detected}
📢 Notified: ${stats.by_status.notified}
✋ Acknowledged: ${stats.by_status.acknowledged}
🔧 Investigating: ${stats.by_status.investigating}
✅ Resolved: ${stats.by_status.resolved}

${stats.mttr_minutes ? `MTTR: ${stats.mttr_minutes.toFixed(2)} minutos` : ''}`

      return {
        content: [{ type: 'text', text }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo stats:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleServerStatus(_args: any): Promise<MCPToolResponse> {
    try {
      const [outboxStats, incidentStats] = await Promise.all([
        this.logService.getOutboxRepository().getStats(),
        this.logService.getIncidentRepository().getStats(24)
      ])

      const text = `Estado del Servidor

Outbox:
⏳ Pending: ${outboxStats.pending}
⚙️ Processing: ${outboxStats.processing}
✅ Completed: ${outboxStats.completed}
❌ Failed: ${outboxStats.failed}
📈 Success Rate: ${outboxStats.total > 0 ? ((outboxStats.completed / outboxStats.total) * 100).toFixed(2) : '0'}%

Incidentes :
🚨 Total: ${incidentStats.total}
🔴 Critical: ${incidentStats.by_severity.critical}
🟠 High: ${incidentStats.by_severity.high}
✅ Resolved: ${incidentStats.by_status.resolved}
${incidentStats.mttr_minutes ? `MTTR: ${incidentStats.mttr_minutes.toFixed(2)} min` : ''}

Sistema: Operando normalmente`

      return {
        content: [{ type: 'text', text }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo estado del servidor:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  // === JENKINS ACTIONS (Delegan a Action Runner) ===

  public async handleRequestJenkinsRestart(args: {
    job: string
    build: number
    incident_id?: number
    reason?: string
  }): Promise<MCPToolResponse> {
    try {
      const client = await this.logService['pool'].connect()

      try {
        await client.query('BEGIN')

        // 1. Crear solicitud de acción
        const actionId = await this.logService.getActionRequestRepository().createActionRequest(client, {
          action_type: 'jenkins_restart' as any,
          target_job: args.job,
          target_build: args.build,
          incident_id: args.incident_id,
          requested_by: 'claude',
          status: 'pending' as any,
          params: { reason: args.reason }
        })

        // 2. Crear evento en outbox para que el Action Runner lo procese
        await this.logService.getOutboxRepository().insertEvent(client, {
          event_type: 'action_requested' as any,
          aggregate_id: `action_${actionId}`,
          payload: {
            action_id: actionId,
            action_type: 'jenkins_restart',
            target_job: args.job,
            target_build: args.build,
            incident_id: args.incident_id,
            reason: args.reason
          },
          status: 'pending' as any,
          retry_count: 0,
          max_retries: 3
        })

        await client.query('COMMIT')

        return {
          content: [{
            type: 'text',
            text: `Solicitud de restart creada (ID: ${actionId})
 Detalles:
- Job: ${args.job}
- Build: #${args.build}
${args.incident_id ? `- Incidente: #${args.incident_id}` : ''}
${args.reason ? `- Razón: ${args.reason}` : ''}

Estado: pending 

Usa \`get_action_status action_id=${actionId}\` para ver el progreso`
          }]
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('[MCP] Error creando solicitud de restart:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleRequestJenkinsRollback(args: {
    job: string
    target_build: number
    incident_id?: number
    reason?: string
  }): Promise<MCPToolResponse> {
    try {
      const client = await this.logService['pool'].connect()

      try {
        await client.query('BEGIN')

        const actionId = await this.logService.getActionRequestRepository().createActionRequest(client, {
          action_type: 'jenkins_rollback' as any,
          target_job: args.job,
          target_build: args.target_build,
          incident_id: args.incident_id,
          requested_by: 'claude',
          status: 'pending' as any,
          params: { reason: args.reason }
        })

        await this.logService.getOutboxRepository().insertEvent(client, {
          event_type: 'action_requested' as any,
          aggregate_id: `action_${actionId}`,
          payload: {
            action_id: actionId,
            action_type: 'jenkins_rollback',
            target_job: args.job,
            target_build: args.target_build,
            incident_id: args.incident_id,
            reason: args.reason
          },
          status: 'pending' as any,
          retry_count: 0,
          max_retries: 3
        })

        await client.query('COMMIT')

        return {
          content: [{
            type: 'text',
            text: `Solicitud de rollback creada (ID: ${actionId})

Detalles:
- Job: ${args.job}
- Rollback a build: #${args.target_build}
${args.incident_id ? `- Incidente: #${args.incident_id}` : ''}
${args.reason ? `- Razón: ${args.reason}` : ''}

Estado: pending

 Usa \`get_action_status action_id=${actionId}\` para ver el progreso`
          }]
        }
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } catch (error) {
      console.error('[MCP] Error creando solicitud de rollback:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleGetActionStatus(args: { action_id: number }): Promise<MCPToolResponse> {
    try {
      const action = await this.logService.getActionRequestRepository().getActionById(args.action_id)

      if (!action) {
        return {
          content: [{
            type: 'text',
            text: `Acción #${args.action_id} no encontrada`
          }]
        }
      }

      const statusEmoji = {
        'pending': '⏳',
        'running': '⚙️',
        'completed': '✅',
        'failed': '❌',
        'rejected': '🚫'
      }[action.status] || '❓'

      let text = `${statusEmoji} **Acción #${action.id}** - ${action.status.toUpperCase()}

Detalles:
- Tipo: ${action.action_type}
- Job: ${action.target_job}
- Build: #${action.target_build}
- Solicitado por: ${action.requested_by}
- Creado: ${new Date(action.created_at!).toLocaleString('es-PE')}`

      if (action.started_at) {
        text += `\n- Iniciado: ${new Date(action.started_at).toLocaleString('es-PE')}`
      }

      if (action.completed_at) {
        text += `\n- Completado: ${new Date(action.completed_at).toLocaleString('es-PE')}`
        const duration = (new Date(action.completed_at).getTime() - new Date(action.created_at!).getTime()) / 1000
        text += `\n- Duración: ${duration}s`
      }

      if (action.result) {
        text += `\n\nResultado:\n\`\`\`json\n${JSON.stringify(action.result, null, 2)}\n\`\`\``
      }

      if (action.error_message) {
        text += `\n\n Error:\n${action.error_message}`
      }

      return {
        content: [{ type: 'text', text }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo estado de acción:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  public async handleGetActionsStats(args: { hours?: number }): Promise<MCPToolResponse> {
    try {
      const hours = Math.min(args?.hours || 24, 168)
      const stats = await this.logService.getActionRequestRepository().getStats(hours)

      const text = `Estadísticas de Acciones** (últimas ${hours}h)

Total: ${stats.total} acciones

Por Estado:
⏳ Pending: ${stats.by_status.pending}
⚙️ Running: ${stats.by_status.running}
✅ Completed: ${stats.by_status.completed}
❌ Failed: ${stats.by_status.failed}
🚫 Rejected: ${stats.by_status.rejected}

Por Tipo:
🔄 Restart: ${stats.by_type.restart}
⏪ Rollback: ${stats.by_type.rollback}
🛑 Stop: ${stats.by_type.stop}

📈 **Success Rate**: ${stats.success_rate.toFixed(2)}%`

      return {
        content: [{ type: 'text', text }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo stats de acciones:', error)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`
        }]
      }
    }
  }

  // === HELPER METHODS ===

  private getLevelEmoji(level: string): string {
    const emojis: Record<string, string> = {
      'ERROR': '🔴',
      'WARN': '🟡',
      'INFO': '🔵',
      'DEBUG': '⚪'
    }
    return emojis[level] || '⚪'
  }

  private getStatusEmoji(status: number): string {
    if (status >= 500) return '🔴'
    if (status >= 400) return '🟠'
    if (status >= 300) return '🔵'
    if (status >= 200) return '🟢'
    return '⚪'
  }

  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      'critical': '🔥',
      'high': '🔴',
      'medium': '🟡',
      'low': '🟢'
    }
    return emojis[severity] || '⚪'
  }
}