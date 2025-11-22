export interface DatabaseConfig {
    host: string
    port: number
    database: string
    user: string
    password: string
    maxConnections: number
}

export interface RabbitMQConfig {
    url: string
    queueName: string
    exchangeName: string
}

export interface JenkinsConfig {
    baseUrl: string
    username: string
    apiToken: string
}

export interface SecurityConfig {
    allowedJobs: string[]
    businessHoursOnly: boolean
    businessHoursStart: number
    businessHoursEnd: number
    maxConcurrentActions: number
    dryRun: boolean
}