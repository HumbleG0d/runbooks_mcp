import { Pool } from 'pg'
import { Config } from './config/Config'
import { ActionRepository } from './db/ActionRepository'
import { ActionExecutor } from './services/ActionExecutor'
import { ActionConsumer } from './consumer/ActionConsumer'
import { JenkinsClient } from './services/JenkinsClient'

async function main() {
    console.log(`
Ejecutor de acciones automatizadas en Jenkins
  `)

    const config = Config.getInstance()

    try {
        // 1. Conectar a PostgreSQL
        console.log('Conectando a PostgreSQL...')
        const pool = new Pool({
            host: config.database.host,
            port: config.database.port,
            database: config.database.database,
            user: config.database.user,
            password: config.database.password,
            max: config.database.maxConnections
        })

        // Verificar conexión
        const client = await pool.connect()
        console.log('Conectado a PostgreSQL')
        client.release()

        // 2. Inicializar repositorio
        const actionRepo = new ActionRepository(pool)

        // 3. Verificar conexión con Jenkins
        console.log('Verificando conexión con Jenkins...')
        const jenkinsClient = new JenkinsClient(config.jenkins)
        const jenkinsHealthy = await jenkinsClient.healthCheck()

        if (!jenkinsHealthy) {
            console.warn('Jenkins no está disponible. Continuando de todos modos...')
        } else {
            console.log('Conexión con Jenkins OK')
        }

        // 4. Inicializar executor
        const actionExecutor = new ActionExecutor(actionRepo)

        // 5. Mostrar estadísticas iniciales
        await actionExecutor.getExecutionStats(24)

        // 6. Iniciar consumer de RabbitMQ
        console.log('Iniciando RabbitMQ Consumer...')
        const actionConsumer = new ActionConsumer(actionRepo, actionExecutor)
        await actionConsumer.start()

        // 7. Procesar acciones pendientes al iniciar
        console.log('Procesando acciones pendientes...')
        await actionExecutor.processPendingActions(5)

        // 8. Configuración mostrada
        console.log(`
╔═══════════════════════════════════════════════════════╗
║  ACTION RUNNER INICIADO                           ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Configuración:                                    ║
║  ─────────────────                                    ║
║  Database:        ${config.database.host}:${config.database.port.toString().padEnd(28)}║
║  Jenkins:         ${config.jenkins.baseUrl.substring(0, 35).padEnd(38)}║
║  RabbitMQ:        ${config.rabbitmq.url.substring(0, 35).padEnd(38)}║
║  Queue:           ${config.rabbitmq.queueName.padEnd(38)}║
║                                                       ║
║  Seguridad:                                        ║
║  ─────────────────                                    ║
║  Allowed Jobs:    ${config.security.allowedJobs.length} jobs                              ║
║  Business Hours:  ${config.security.businessHoursOnly ? 'Enabled' : 'Disabled'.padEnd(30)}║
║  Max Concurrent:  ${config.security.maxConcurrentActions.toString().padEnd(38)}║
║  Dry Run:         ${config.security.dryRun ? 'YES ' : 'No'.padEnd(30)}║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
    `)

        // 9. Shutdown graceful
        const shutdown = async (signal: string) => {
            console.log(`\n Señal ${signal} recibida, cerrando Action Runner...`)

            try {
                await actionConsumer.stop()
                await pool.end()
                console.log('Action Runner cerrado correctamente')
                process.exit(0)
            } catch (error) {
                console.error('Error durante el cierre:', error)
                process.exit(1)
            }
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'))
        process.on('SIGINT', () => shutdown('SIGINT'))

        // 10. Heartbeat cada minuto
        setInterval(async () => {
            const stats = await actionRepo.getStats(1)
            if (stats.total > 0) {
                console.log(`[Heartbeat] Última hora: ${stats.total} acciones (${stats.completed} OK, ${stats.failed} failed)`)
            }
        }, 60000)

    } catch (error) {
        console.error('Error fatal:', error)
        process.exit(1)
    }
}

// Ejecutar
main().catch((error) => {
    console.error('Error no manejado:', error)
    process.exit(1)
})