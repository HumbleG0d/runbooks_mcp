import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from "../types/types";
import { Pool } from "pg";

export class LogsService {
    private pool: Pool;

    constructor() {
        this.pool = new Pool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'mcp_logs',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            max: 20,
        });
    }

    async initialize(): Promise<void> {
        const client = await this.pool.connect();
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

            `);

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
            `);

            console.log('Base de datos inicializada correctamente');
        } catch (error) {
            console.error('Error inicializando base de datos:', error);
            throw error;
        } finally {
            client.release();
        }
    }


    async insertLogsJenkins(logs: ResponseToRabbitJenkins[]): Promise<number> {
        if (logs.length === 0) {
            console.log('No hay logs de Jenkins para insertar');
            return 0;
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Usar parámetros parametrizados para evitar SQL injection
            const values: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            for (const log of logs) {
                values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
                params.push(
                    log._index,
                    log['@timestamp'],
                    log.level,
                    log.message
                );
                paramIndex += 4;
            }

            const query = `
                INSERT INTO logs_jenkins (index_name, timestamp, level, message)
                VALUES ${values.join(', ')}
            `;

            const result = await client.query(query, params);
            await client.query('COMMIT');

            console.log(`${result.rowCount} logs de Jenkins insertados`);
            return result.rowCount || 0;

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error insertando logs de Jenkins:', error);
            throw error;
        } finally {
            client.release();
        }
    }


    async insertLogsAPI(logs: ResponseToRabbitAPI[]): Promise<number> {
        if (logs.length === 0) {
            console.log('No hay logs de API para insertar');
            return 0;
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            const values: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            for (const log of logs) {
                values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
                params.push(
                    log._index,
                    log['@timestamp'],
                    log.message,
                    log.http_method,
                    log.http_status
                );
                paramIndex += 5;
            }

            const query = `
                INSERT INTO logs_api (index_name, timestamp, message, http_method, http_status)
                VALUES ${values.join(', ')}
            `;

            const result = await client.query(query, params);
            await client.query('COMMIT');

            console.log(`${result.rowCount} logs de API insertados`);
            return result.rowCount || 0;

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error insertando logs de API:', error);
            throw error;
        } finally {
            client.release();
        }
    }


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
            );

            return result.rows;
        } catch (error) {
            console.error('Error obteniendo logs de Jenkins:', error);
            throw error;
        }
    }


    async getLogsJenkinsByLevel(level: string, limit: number = 100): Promise<ResponseToRabbitJenkins[]> {
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
            );

            return result.rows;
        } catch (error) {
            console.error('Error obteniendo logs de Jenkins por nivel:', error);
            throw error;
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
            );

            return result.rows;
        } catch (error) {
            console.error('Error obteniendo logs de API:', error);
            throw error;
        }
    }

    async close(): Promise<void> {
        await this.pool.end();
        console.log('Conexión a BD cerrada');
    }
}