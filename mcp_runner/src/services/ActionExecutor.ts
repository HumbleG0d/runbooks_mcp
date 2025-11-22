import { ActionExecution, ActionType, JenkinsActionResult } from '../types/actions'
import { JenkinsClient } from './JenkinsClient'
import { ActionGuard } from './ActionGuard'
import { ActionRepository } from '../db/ActionRepository'
import { Config } from '../config/Config'

export class ActionExecutor {
    private jenkinsClient: JenkinsClient
    private actionGuard: ActionGuard
    private config: Config

    constructor(
        private actionRepo: ActionRepository
    ) {
        this.config = Config.getInstance()
        this.jenkinsClient = new JenkinsClient({
            baseUrl: this.config.jenkins.baseUrl,
            username: this.config.jenkins.username,
            apiToken: this.config.jenkins.apiToken
        })
        this.actionGuard = new ActionGuard()
    }

    /**
     * Ejecuta una acción
     */
    async execute(action: ActionExecution): Promise<void> {
        console.log(`\n${'='.repeat(60)}`)
        console.log(`Ejecutando acción #${action.id}`)
        console.log(`   Tipo: ${action.action_type}`)
        console.log(`   Job: ${action.target_job}`)
        console.log(`   Build: ${action.target_build || 'N/A'}`)
        console.log(`${'='.repeat(60)}\n`)

        try {
            // 1. Validar seguridad
            const validation = await this.actionGuard.validate(action)

            if (!validation.allowed) {
                await this.actionRepo.markAsRejected(action.id, validation.reason!)
                console.log(`Acción #${action.id} RECHAZADA: ${validation.reason}`)
                return
            }

            // 2. Verificar límite de acciones concurrentes
            const runningCount = await this.actionRepo.getRunningActionsCount()
            if (runningCount >= this.config.security.maxConcurrentActions) {
                console.log(`Límite de acciones concurrentes alcanzado (${runningCount}/${this.config.security.maxConcurrentActions})`)
                // La acción permanece en PENDING, será procesada después
                return
            }

            // 3. Marcar como RUNNING
            await this.actionRepo.markAsRunning(action.id)

            // 4. Verificar conexión con Jenkins
            const isHealthy = await this.jenkinsClient.healthCheck()
            if (!isHealthy) {
                throw new Error('Jenkins no está disponible')
            }

            // 5. Modo DRY RUN
            if (this.actionGuard.isDryRun()) {
                console.log(`[DRY RUN] Simulando ejecución de ${action.action_type}`)
                await new Promise(resolve => setTimeout(resolve, 2000))

                await this.actionRepo.markAsCompleted(action.id, {
                    dry_run: true,
                    action: action.action_type,
                    job: action.target_job,
                    build: action.target_build,
                    message: 'DRY RUN: Acción simulada exitosamente'
                })

                console.log(`[DRY RUN] Acción #${action.id} simulada`)
                return
            }

            // 6. Ejecutar la acción según su tipo
            let result: JenkinsActionResult

            switch (action.action_type) {
                case ActionType.JENKINS_RESTART:
                    result = await this.jenkinsClient.restartBuild(
                        action.target_job,
                        action.target_build!
                    )
                    break

                case ActionType.JENKINS_ROLLBACK:
                    result = await this.jenkinsClient.rollbackToBuild(
                        action.target_job,
                        action.target_build!
                    )
                    break

                case ActionType.JENKINS_STOP:
                    result = await this.jenkinsClient.stopBuild(
                        action.target_job,
                        action.target_build!
                    )
                    break

                default:
                    throw new Error(`Tipo de acción no soportado: ${action.action_type}`)
            }

            // 7. Guardar resultado
            if (result.success) {
                await this.actionRepo.markAsCompleted(action.id, {
                    action: result.action,
                    job: result.jobName,
                    oldBuild: result.buildNumber,
                    newBuild: result.newBuildNumber,
                    message: result.message,
                    details: result.details
                })

                console.log(`Acción #${action.id} COMPLETADA`)
                console.log(`   ${result.message}`)
            } else {
                await this.actionRepo.markAsFailed(action.id, result.message)
                console.log(`Acción #${action.id} FALLIDA`)
                console.log(`   ${result.message}`)
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error desconocido'

            await this.actionRepo.markAsFailed(action.id, errorMessage)

            console.error(`Error ejecutando acción #${action.id}:`, error)
        }

        console.log(`\n${'='.repeat(60)}\n`)
    }

    /**
     * Procesa múltiples acciones pendientes
     */
    async processPendingActions(limit: number = 10): Promise<void> {
        const pendingActions = await this.actionRepo.getPendingActions(limit)

        if (pendingActions.length === 0) {
            return
        }

        console.log(`Procesando ${pendingActions.length} acciones pendientes...`)

        // Procesar acciones de forma secuencial (evitar race conditions)
        for (const action of pendingActions) {
            await this.execute(action)
        }
    }

    /**
     * Obtiene estadísticas de ejecución
     */
    async getExecutionStats(hours: number = 24): Promise<void> {
        const stats = await this.actionRepo.getStats(hours)

        console.log(`\nEstadísticas de Ejecución (últimas ${hours}h)`)
        console.log(`${'─'.repeat(40)}`)
        console.log(`Total:     ${stats.total}`)
        console.log(`Completed: ${stats.completed}`)
        console.log(`Failed:    ${stats.failed}`)
        console.log(`Rejected:  ${stats.rejected}`)
        console.log(`Avg Duration: ${stats.avgDuration.toFixed(2)}s`)
        console.log(`${'─'.repeat(40)}\n`)
    }
}