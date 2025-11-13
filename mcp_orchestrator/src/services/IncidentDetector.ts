import {
    IncidentRule,
    DetectedIncident,
    INCIDENT_RULES,
    IncidentSeverity,
    IncidentStatus
} from '../types/incident'
import { ResponseToRabbitJenkins, ResponseToRabbitAPI } from '../types/types'

export class IncidentDetector {
    private rules: IncidentRule[]

    constructor(customRules?: IncidentRule[]) {
        this.rules = customRules || INCIDENT_RULES
    }

    /**
     * FLUJO PROACTIVO: Analiza logs de Jenkins en tiempo real
     */
    public analyzeJenkinsLogs(logs: ResponseToRabbitJenkins[], logIds: number[]): DetectedIncident[] {
        const incidents: DetectedIncident[] = []
        const jenkinsRules = this.rules.filter(r => r.type === 'jenkins')

        logs.forEach((log, index) => {
            for (const rule of jenkinsRules) {
                if (rule.condition(log)) {
                    const incident: DetectedIncident = {
                        incident_type: rule.name,
                        severity: rule.severity,
                        status: IncidentStatus.DETECTED,
                        log_id: logIds[index],
                        log_type: 'jenkins',
                        details: {
                            level: log.level,
                            message: log.message,
                            timestamp: log['@timestamp'],
                            index_name: log._index
                        },
                        runbook_url: rule.runbook,
                        detected_at: new Date()
                    }

                    incidents.push(incident)

                    console.error(`[INCIDENT DETECTED] ${rule.name}:`, {
                        severity: rule.severity,
                        logId: logIds[index],
                        message: log.message.substring(0, 100)
                    })

                    // Solo detectar la primera regla que coincida por log
                    break
                }
            }
        })

        return incidents
    }

    /**
     * FLUJO PROACTIVO: Analiza logs de API en tiempo real
     */
    public analyzeApiLogs(logs: ResponseToRabbitAPI[], logIds: number[]): DetectedIncident[] {
        const incidents: DetectedIncident[] = []
        const apiRules = this.rules.filter(r => r.type === 'api')

        logs.forEach((log, index) => {
            for (const rule of apiRules) {
                if (rule.condition(log)) {
                    const incident: DetectedIncident = {
                        incident_type: rule.name,
                        severity: rule.severity,
                        status: IncidentStatus.DETECTED,
                        log_id: logIds[index],
                        log_type: 'api',
                        details: {
                            http_method: log.http_method,
                            http_status: log.http_status,
                            message: log.message,
                            timestamp: log['@timestamp'],
                            index_name: log._index
                        },
                        runbook_url: rule.runbook,
                        detected_at: new Date()
                    }

                    incidents.push(incident)

                    console.log(`[INCIDENT DETECTED] ${rule.name}:`, {
                        severity: rule.severity,
                        logId: logIds[index],
                        status: log.http_status,
                        method: log.http_method
                    })

                    break
                }
            }
        })

        return incidents
    }

    /**
     * Filtra solo incidentes críticos para notificación inmediata
     */
    public filterCriticalIncidents(incidents: DetectedIncident[]): DetectedIncident[] {
        return incidents.filter(
            incident => incident.severity === IncidentSeverity.CRITICAL ||
                incident.severity === IncidentSeverity.HIGH
        )
    }

    /**
     * Agrega reglas personalizadas
     */
    public addRule(rule: IncidentRule): void {
        this.rules.push(rule)
        console.log(`Nueva regla agregada: ${rule.name}`)
    }

    /**
     * Obtiene todas las reglas activas
     */
    public getRules(): IncidentRule[] {
        return this.rules
    }
}