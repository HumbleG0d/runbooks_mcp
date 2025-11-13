// db/LogsService.ts - ACTUALIZADO CON OUTBOX PATTERN + INCIDENT DETECTION
import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from '../types/types'
import { Pool, PoolClient } from 'pg'
import { Config } from '../config/Config'
import { OutboxRepository } from './OutboxRepository'
import { IncidentRepository } from './IncidentRepository'
import { OutboxEventType, OutboxEventStatus } from '../types/outbox'
import { IncidentDetector } from '../services/IncidentDetector'

export class LogsService {
  private pool: Pool
  private config: Config
  private outboxRepo: OutboxRepository
  private incidentRepo: IncidentRepository
  private incidentDetector: IncidentDetector

  constructor() {
    this.config = Config.getInstance()
    this.pool = new Pool({
      host: this.config.databaseConfig.host,
      port: this.config.databaseConfig.port,
      database: this.config.databaseConfig.database,
      user: this.config.databaseConfig.user,
      password: this.config.databaseConfig.password,
      max: this.config.databaseConfig.maxConnections,
    })
    this.outboxRepo = new OutboxRepository(this.pool)
    this.incidentRepo = new IncidentRepository(this.pool)
    this.incidentDetector = new IncidentDetector()
  }

  async initialize(): Promise<void> {
    const client = await this.pool.connect()
    try {
      // Crear tabla de logs de Jenkins
      await client.query(`
        CREATE TABLE IF NOT EXISTS logs_jenkins (
          id SERIAL PRIMARY KEY,
          index_name VARCHAR(255) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          level VARCHAR(50) NOT NULL,
          message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `)

      // Crear tabla de logs de API
      await client.query(`
        CREATE TABLE IF NOT EXISTS logs_api (
          id SERIAL PRIMARY KEY,
          index_name VARCHAR(255) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          message TEXT,
          http_method VARCHAR(10) NOT NULL,
          http_status INTEGER NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `)

      // Inicializar tabla outbox
      await this.outboxRepo.initialize()

      // Inicializar tabla incidents
      await this.incidentRepo.initialize()

      console.error('Base de datos inicializada correctamente')
    } catch (error) {
      console.error('Error inicializando base de datos:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * FLUJO PROACTIVO: Inserta logs de Jenkins + detecta incidentes + crea eventos outbox
   * En UNA SOLA TRANSACCIÓN ATÓMICA
   */
  async insertLogsJenkins(logs: ResponseToRabbitJenkins[]): Promise<number> {
    if (logs.length === 0) {
      console.error('No hay logs de Jenkins para insertar')
      return 0
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Insertar logs en logs_jenkins
      const insertedIds = await this.insertJenkinsLogsInTransaction(client, logs)

      // 2. ANÁLISIS PROACTIVO: Detectar incidentes en tiempo real
      const detectedIncidents = this.incidentDetector.analyzeJenkinsLogs(logs, insertedIds)

      // 3. Insertar incidentes detectados
      let incidentIds: number[] = []
      if (detectedIncidents.length > 0) {
        incidentIds = await this.incidentRepo.insertIncidents(client, detectedIncidents)
        console.error(`${detectedIncidents.length} incidentes detectados en Jenkins`)
      }

      // 4. Crear evento outbox para logs batch
      await this.outboxRepo.insertEvent(client, {
        event_type: OutboxEventType.JENKINS_LOG_CREATED,
        aggregate_id: `jenkins_batch_${Date.now()}`,
        payload: {
          log_ids: insertedIds,
          count: logs.length,
          levels: [...new Set(logs.map(l => l.level))],
          first_timestamp: logs[0]['@timestamp'],
          last_timestamp: logs[logs.length - 1]['@timestamp'],
          incidents_detected: detectedIncidents.length
        },
        status: OutboxEventStatus.PENDING,
        retry_count: 0,
        max_retries: 3
      })

      // 5. Si hay incidentes CRÍTICOS, crear eventos outbox individuales para notificación inmediata
      const criticalIncidents = this.incidentDetector.filterCriticalIncidents(detectedIncidents)

      for (let i = 0; i < criticalIncidents.length; i++) {
        const incident = criticalIncidents[i]
        await this.outboxRepo.insertEvent(client, {
          event_type: OutboxEventType.INCIDENT_DETECTED,
          aggregate_id: `incident_${incidentIds[i]}`,
          payload: {
            incident_id: incidentIds[i],
            incident_type: incident.incident_type,
            severity: incident.severity,
            log_id: incident.log_id,
            details: incident.details,
            runbook_url: incident.runbook_url,
            detected_at: incident.detected_at
          },
          status: OutboxEventStatus.PENDING,
          retry_count: 0,
          max_retries: 5 // Más reintentos para incidentes críticos
        })
      }

      await client.query('COMMIT')

      if (criticalIncidents.length > 0) {
        console.error(`${criticalIncidents.length} incidentes CRÍTICOS detectados → Notificación inmediata programada`)
      }

      console.error(`${logs.length} logs de Jenkins insertados + evento outbox creado`)
      return logs.length
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error insertando logs de Jenkins:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * FLUJO PROACTIVO: Inserta logs de API + detecta incidentes + crea eventos outbox
   * En UNA SOLA TRANSACCIÓN ATÓMICA
   */
  async insertLogsAPI(logs: ResponseToRabbitAPI[]): Promise<number> {
    if (logs.length === 0) {
      console.error('No hay logs de API para insertar')
      return 0
    }

    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Insertar logs en logs_api
      const insertedIds = await this.insertApiLogsInTransaction(client, logs)

      // 2. ANÁLISIS PROACTIVO: Detectar incidentes en tiempo real
      const detectedIncidents = this.incidentDetector.analyzeApiLogs(logs, insertedIds)

      // 3. Insertar incidentes detectados
      let incidentIds: number[] = []
      if (detectedIncidents.length > 0) {
        incidentIds = await this.incidentRepo.insertIncidents(client, detectedIncidents)
        console.error(`${detectedIncidents.length} incidentes detectados en API`)
      }

      // 4. Crear evento outbox para logs batch
      await this.outboxRepo.insertEvent(client, {
        event_type: OutboxEventType.API_LOG_CREATED,
        aggregate_id: `api_batch_${Date.now()}`,
        payload: {
          log_ids: insertedIds,
          count: logs.length,
          methods: [...new Set(logs.map(l => l.http_method))],
          statuses: [...new Set(logs.map(l => l.http_status))],
          first_timestamp: logs[0]['@timestamp'],
          last_timestamp: logs[logs.length - 1]['@timestamp'],
          incidents_detected: detectedIncidents.length
        },
        status: OutboxEventStatus.PENDING,
        retry_count: 0,
        max_retries: 3
      })

      // 5. Si hay incidentes CRÍTICOS, crear eventos outbox individuales
      const criticalIncidents = this.incidentDetector.filterCriticalIncidents(detectedIncidents)

      for (let i = 0; i < criticalIncidents.length; i++) {
        const incident = criticalIncidents[i]
        await this.outboxRepo.insertEvent(client, {
          event_type: OutboxEventType.INCIDENT_DETECTED,
          aggregate_id: `incident_${incidentIds[i]}`,
          payload: {
            incident_id: incidentIds[i],
            incident_type: incident.incident_type,
            severity: incident.severity,
            log_id: incident.log_id,
            details: incident.details,
            runbook_url: incident.runbook_url,
            detected_at: incident.detected_at
          },
          status: OutboxEventStatus.PENDING,
          retry_count: 0,
          max_retries: 5
        })
      }

      await client.query('COMMIT')

      if (criticalIncidents.length > 0) {
        console.error(`${criticalIncidents.length} incidentes CRÍTICOS detectados → Notificación inmediata programada`)
      }

      console.error(`${logs.length} logs de API insertados + evento outbox creado`)
      return logs.length
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('Error insertando logs de API:', error)
      throw error
    } finally {
      client.release()
    }
  }

  // Métodos auxiliares privados para inserción dentro de transacción

  private async insertJenkinsLogsInTransaction(
    client: PoolClient,
    logs: ResponseToRabbitJenkins[]
  ): Promise<number[]> {
    const values: string[] = []
    const params: any[] = []
    let paramIndex = 1

    for (const log of logs) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`
      )
      params.push(log._index, log['@timestamp'], log.level, log.message)
      paramIndex += 4
    }

    const query = `
      INSERT INTO logs_jenkins (index_name, timestamp, level, message)
      VALUES ${values.join(', ')}
      RETURNING id
    `

    const result = await client.query(query, params)
    return result.rows.map(r => r.id)
  }

  private async insertApiLogsInTransaction(
    client: PoolClient,
    logs: ResponseToRabbitAPI[]
  ): Promise<number[]> {
    const values: string[] = []
    const params: any[] = []
    let paramIndex = 1

    for (const log of logs) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
      )
      params.push(
        log._index,
        log['@timestamp'],
        log.message,
        log.http_method,
        log.http_status
      )
      paramIndex += 5
    }

    const query = `
      INSERT INTO logs_api (index_name, timestamp, message, http_method, http_status)
      VALUES ${values.join(', ')}
      RETURNING id
    `

    const result = await client.query(query, params)
    return result.rows.map(r => r.id)
  }

  // Métodos de lectura (sin cambios)

  async getLogsJenkins(limit: number = 100): Promise<ResponseToRabbitJenkins[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          index_name as "_index",
          timestamp as "@timestamp",
          level,
          message
        FROM logs_jenkins
        ORDER BY timestamp DESC
        LIMIT $1`,
        [limit]
      )
      return result.rows
    } catch (error) {
      console.error('Error obteniendo logs de Jenkins:', error)
      throw error
    }
  }

  async getLogsJenkinsByLevel(
    level: string,
    limit: number = 100
  ): Promise<ResponseToRabbitJenkins[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          index_name as "_index",
          timestamp as "@timestamp",
          level,
          message
        FROM logs_jenkins
        WHERE level = $1
        ORDER BY timestamp DESC
        LIMIT $2`,
        [level, limit]
      )
      return result.rows
    } catch (error) {
      console.error('Error obteniendo logs de Jenkins por nivel:', error)
      throw error
    }
  }

  async getLogsAPI(limit: number = 100): Promise<ResponseToRabbitAPI[]> {
    try {
      const result = await this.pool.query(
        `SELECT 
          index_name as "_index",
          timestamp as "@timestamp",
          message,
          http_method,
          http_status
        FROM logs_api
        ORDER BY timestamp DESC
        LIMIT $1`,
        [limit]
      )
      return result.rows
    } catch (error) {
      console.error('Error obteniendo logs de API:', error)
      throw error
    }
  }

  async close(): Promise<void> {
    await this.pool.end()
    console.error('Conexión a BD cerrada')
  }

  // Getter para repositorios
  getOutboxRepository(): OutboxRepository {
    return this.outboxRepo
  }

  getIncidentRepository(): IncidentRepository {
    return this.incidentRepo
  }

  getIncidentDetector(): IncidentDetector {
    return this.incidentDetector
  }
}