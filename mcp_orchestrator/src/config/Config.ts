// config/Config.ts - ACTUALIZADO
import { ServerConfig, DatabaseConfig } from '../types/server'
import { OutboxConfig } from '../types/outbox'

export class Config {
  private static instance: Config
  private _serverConfig: ServerConfig
  private _databaseConfig: DatabaseConfig
  private _outboxConfig: OutboxConfig

  private constructor() {
    this._serverConfig = this.loadServerConfig()
    this._databaseConfig = this.loadDatabaseConfig()
    this._outboxConfig = this.loadOutboxConfig()
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config()
    }
    return Config.instance
  }

  private loadServerConfig(): ServerConfig {
    return {
      name: process.env.SERVER_NAME || 'runbooks-mcp-server',
      version: process.env.SERVER_VERSION || '1.0.0',
      httpPort: parseInt(process.env.HTTP_PORT || '3222'),
      mode: process.env.MCP_MODE as 'hybrid'
    }
  }

  private loadDatabaseConfig(): DatabaseConfig {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'mcp_logs',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20')
    }
  }

  private loadOutboxConfig(): OutboxConfig {
    return {
      processingInterval: parseInt(process.env.OUTBOX_PROCESSING_INTERVAL || '5000'), // 5 segundos
      batchSize: parseInt(process.env.OUTBOX_BATCH_SIZE || '50'),
      maxRetries: parseInt(process.env.OUTBOX_MAX_RETRIES || '3'),
      retryBackoffMs: parseInt(process.env.OUTBOX_RETRY_BACKOFF_MS || '1000'), // 1 segundo base
      lockTimeout: parseInt(process.env.OUTBOX_LOCK_TIMEOUT || '300') // 5 minutos
    }
  }

  public get serverConfig(): ServerConfig {
    return this._serverConfig
  }

  public get databaseConfig(): DatabaseConfig {
    return this._databaseConfig
  }

  public get outboxConfig(): OutboxConfig {
    return this._outboxConfig
  }

  public updateServerConfig(updates: Partial<ServerConfig>): void {
    this._serverConfig = { ...this._serverConfig, ...updates }
  }

  public updateDatabaseConfig(updates: Partial<DatabaseConfig>): void {
    this._databaseConfig = { ...this._databaseConfig, ...updates }
  }

  public updateOutboxConfig(updates: Partial<OutboxConfig>): void {
    this._outboxConfig = { ...this._outboxConfig, ...updates }
  }
}