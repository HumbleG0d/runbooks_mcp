// types/outbox.ts

export enum OutboxEventType {
    JENKINS_LOG_CREATED = 'jenkins_log_created',
    API_LOG_CREATED = 'api_log_created',
    LOGS_BATCH_PROCESSED = 'logs_batch_processed',
    INCIDENT_DETECTED = 'incident_detected'
}

export enum OutboxEventStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

export interface OutboxEvent {
    id?: number
    event_type: OutboxEventType
    aggregate_id: string // ID del log o batch
    payload: Record<string, any>
    status: OutboxEventStatus
    retry_count: number
    max_retries: number
    error_message?: string
    created_at: Date
    processed_at?: Date
    next_retry_at?: Date
}

export interface OutboxConfig {
    processingInterval: number // ms entre ejecuciones
    batchSize: number // eventos a procesar por lote
    maxRetries: number
    retryBackoffMs: number // base para exponential backoff
    lockTimeout: number // segundos para lock de eventos
}