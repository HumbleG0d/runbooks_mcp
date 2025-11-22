export interface ActionResult {
    success: boolean
    action: string
    jobName: string
    buildNumber?: number
    message: string
    timestamp: Date
}

// src/types/types.ts

export enum ActionType {
    JENKINS_RESTART = 'jenkins_restart',
    JENKINS_ROLLBACK = 'jenkins_rollback',
    JENKINS_STOP = 'jenkins_stop'
}

export enum ActionStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REJECTED = 'rejected'
}

export enum ActionRisk {
    SAFE = 'safe',           // Puede ejecutarse automáticamente
    MODERATE = 'moderate',   // Requiere validaciones adicionales
    DANGEROUS = 'dangerous', // Requiere aprobación manual
    FORBIDDEN = 'forbidden'  // No se permite
}

export interface ActionExecution {
    id: number
    action_type: ActionType
    target_job: string
    target_build?: number
    incident_id?: number
    requested_by: string
    status: ActionStatus
    params?: Record<string, any>
    result?: Record<string, any>
    error_message?: string
    created_at: Date
    started_at?: Date
    completed_at?: Date
}

export interface ActionEvent {
    action_id: number
    action_type: ActionType
    target_job: string
    target_build?: number
    incident_id?: number
    reason?: string
}

export interface JenkinsConfig {
    baseUrl: string
    username: string
    apiToken: string
}

export interface JenkinsActionResult {
    success: boolean
    action: string
    jobName: string
    buildNumber?: number
    newBuildNumber?: number
    message: string
    timestamp: Date
    details?: Record<string, any>
}

export interface SecurityRule {
    name: string
    check: (action: ActionExecution) => Promise<boolean>
    risk: ActionRisk
    errorMessage: string
}