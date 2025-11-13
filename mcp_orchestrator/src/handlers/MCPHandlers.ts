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
          text: `**Logs de Jenkins** (${logs.length} registros)${filterText}\n\n${formattedLogs}`
        }]
      }
    } catch (error) {
      console.error('[MCP] Error obteniendo logs de Jenkins:', error)
      return {
        content: [{
          type: 'text',
          text: `Error obteniendo logs de Jenkins: ${error instanceof Error ? error.message : 'Error desconocido'}`
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
            text: `No se encontraron logs de API${status ? ` con status ${status}` : ''}`
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
          text: `**Logs de API** (${logs.length} registros)${filterText}\n\n${formattedLogs}`
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
${inc.runbook_url ? `Runbook: ${inc.runbook_url}` : ''}
${details.message ? `${details.message.substring(0, 150)}...` : ''}`
      }).join('\n\n---\n\n')

      return {
        content: [{
          type: 'text',
          text: `**Incidentes Activos** (${incidents.length} encontrados)\n\n${formatted}`
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

        return `${emoji} **[${inc.severity.toUpperCase()}] ${inc.incident_type}** (ID: ${inc.id})
 ${timestamp} | ${inc.status}
${inc.runbook_url ? `Runbook: ${inc.runbook_url}` : ''}
 ${JSON.stringify(inc.details).substring(0, 100)}...`
      }).join('\n\n')

      return {
        content: [{
          type: 'text',
          text: `**Incidentes Críticos** (${allCritical.length})\n\n${formatted}\n\nRequieren atención inmediata`
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

      const text = `**Estadísticas de Incidentes** (últimas ${hours}h)

**Total**: ${stats.total} incidentes

**Por Severidad**:
🔴 Critical: ${stats.by_severity.critical}
🟠 High: ${stats.by_severity.high}
🟡 Medium: ${stats.by_severity.medium}
🟢 Low: ${stats.by_severity.low}

**Por Estado**:
🔍 Detected: ${stats.by_status.detected}
📢 Notified: ${stats.by_status.notified}
✋ Acknowledged: ${stats.by_status.acknowledged}
🔧 Investigating: ${stats.by_status.investigating}
✅ Resolved: ${stats.by_status.resolved}

${stats.mttr_minutes ? `⏱️ **MTTR**: ${stats.mttr_minutes.toFixed(2)} minutos` : ''}`

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

      const text = `**Estado del Servidor**

**Outbox**:
⏳ Pending: ${outboxStats.pending}
⚙️ Processing: ${outboxStats.processing}
✅ Completed: ${outboxStats.completed}
❌ Failed: ${outboxStats.failed}
📈 Success Rate: ${outboxStats.total > 0 ? ((outboxStats.completed / outboxStats.total) * 100).toFixed(2) : '0'}%

**Incidentes (24h)**:
🚨 Total: ${incidentStats.total}
🔴 Critical: ${incidentStats.by_severity.critical}
🟠 High: ${incidentStats.by_severity.high}
✅ Resolved: ${incidentStats.by_status.resolved}
${incidentStats.mttr_minutes ? `⏱️ MTTR: ${incidentStats.mttr_minutes.toFixed(2)} min` : ''}

**Sistema**: ✅ Operando normalmente`

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