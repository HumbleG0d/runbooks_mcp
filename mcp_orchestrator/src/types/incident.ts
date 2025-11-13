export enum IncidentSeverity {
    CRITICAL = 'critical',
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low'
}

export enum IncidentStatus {
    DETECTED = 'detected',
    NOTIFIED = 'notified',
    ACKNOWLEDGED = 'acknowledged',
    INVESTIGATING = 'investigating',
    RESOLVED = 'resolved'
}

export interface IncidentRule {
    name: string
    type: 'jenkins' | 'api'
    severity: IncidentSeverity
    condition: (log: any) => boolean
    description: string
    runbook?: string
}

export interface DetectedIncident {
    id?: number
    incident_type: string
    severity: IncidentSeverity
    status: IncidentStatus
    log_id: number
    log_type: 'jenkins' | 'api'
    details: Record<string, any>
    runbook_url?: string
    detected_at: Date
    notified_at?: Date
    resolved_at?: Date
}

// Reglas de detección predefinidas
export const INCIDENT_RULES: IncidentRule[] = [
    // Jenkins Rules
    {
        name: 'jenkins_build_failure',
        type: 'jenkins',
        severity: IncidentSeverity.HIGH,
        condition: (log) =>
            log.level === 'ERROR' &&
            /build.*(fail|error)/i.test(log.message),
        description: 'Build de Jenkins falló',
        runbook: ''
    },
    {
        name: 'jenkins_deployment_failure',
        type: 'jenkins',
        severity: IncidentSeverity.CRITICAL,
        condition: (log) =>
            log.level === 'ERROR' &&
            /deploy.*(fail|error)/i.test(log.message),
        description: 'Deployment falló',
        runbook: ''
    },
    {
        name: 'jenkins_timeout',
        type: 'jenkins',
        severity: IncidentSeverity.MEDIUM,
        condition: (log) =>
            log.level === 'ERROR' &&
            /timeout/i.test(log.message),
        description: 'Timeout en Jenkins',
        runbook: ''
    },

    // API Rules
    {
        name: 'api_5xx_error',
        type: 'api',
        severity: IncidentSeverity.CRITICAL,
        condition: (log) =>
            log.http_status >= 500 && log.http_status < 600,
        description: 'Error 5xx en API',
        runbook: ''
    },
    {
        name: 'api_4xx_spike',
        type: 'api',
        severity: IncidentSeverity.MEDIUM,
        condition: (log) =>
            log.http_status >= 400 && log.http_status < 500,
        description: 'Error 4xx en API',
        runbook: ''
    },
    {
        name: 'api_authentication_failure',
        type: 'api',
        severity: IncidentSeverity.HIGH,
        condition: (log) =>
            log.http_status === 401 || log.http_status === 403,
        description: 'Fallo de autenticación/autorización',
        runbook: ''
    }
]