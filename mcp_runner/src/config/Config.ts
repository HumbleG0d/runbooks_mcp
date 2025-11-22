import * as dotenv from 'dotenv'
import type { DatabaseConfig, RabbitMQConfig, JenkinsConfig, SecurityConfig } from '../types/config'

dotenv.config()


export class Config {
    private static instance: Config

    private constructor() { }

    public static getInstance(): Config {
        if (!Config.instance) {
            Config.instance = new Config()
        }
        return Config.instance
    }

    public get database(): DatabaseConfig {
        return {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            database: process.env.DB_NAME || 'mcp_logs',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'postgres',
            maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '10')
        }
    }

    public get rabbitmq(): RabbitMQConfig {
        return {
            url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
            queueName: process.env.QUEUE_NAME || 'jenkins_actions',
            exchangeName: process.env.EXCHANGE_NAME || 'logs.events'
        }
    }

    public get jenkins(): JenkinsConfig {
        const baseUrl = process.env.JENKINS_URL || 'http://localhost:8080/'
        const username = process.env.JENKINS_USER || 'sergio'
        const apiToken = process.env.JENKINS_API_TOKEN || '114292333996b1330ccd9da5462d3e356c'

        if (!baseUrl || !username || !apiToken) {
            throw new Error('Jenkins configuration missing. Check JENKINS_URL, JENKINS_USER, and JENKINS_API_TOKEN')
        }

        return { baseUrl, username, apiToken }
    }

    public get security(): SecurityConfig {
        return {
            allowedJobs: (process.env.ALLOWED_JOBS || '').split(',').filter(Boolean),
            businessHoursOnly: process.env.BUSINESS_HOURS_ONLY === 'true',
            businessHoursStart: parseInt(process.env.BUSINESS_HOURS_START || '8'),
            businessHoursEnd: parseInt(process.env.BUSINESS_HOURS_END || '18'),
            maxConcurrentActions: parseInt(process.env.MAX_CONCURRENT_ACTIONS || '3'),
            dryRun: process.env.DRY_RUN === 'true'
        }
    }

    public get serviceName(): string {
        return process.env.SERVICE_NAME || 'action-runner'
    }

    public get serviceVersion(): string {
        return process.env.SERVICE_VERSION || '1.0.0'
    }
}