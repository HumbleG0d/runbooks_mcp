import { ActionExecution, ActionType, ActionRisk, SecurityRule } from '../types/actions'
import { Config } from '../config/Config'

export class ActionGuard {
    private config: Config
    private rules: SecurityRule[]

    constructor() {
        this.config = Config.getInstance()
        this.rules = this.initializeRules()
    }

    /**
     * Valida si una acción puede ejecutarse
     */
    async validate(action: ActionExecution): Promise<{
        allowed: boolean
        risk: ActionRisk
        reason?: string
    }> {
        console.error(`[ActionGuard] Validando acción #${action.id} (${action.action_type})...`)

        // Ejecutar todas las reglas
        for (const rule of this.rules) {
            const passed = await rule.check(action)

            if (!passed) {
                console.error(`[ActionGuard] Regla falló: ${rule.name}`)
                return {
                    allowed: false,
                    risk: rule.risk,
                    reason: rule.errorMessage
                }
            }
        }

        // Determinar el riesgo final
        const risk = this.calculateRisk(action)

        console.error(`[ActionGuard] Validación exitosa. Riesgo: ${risk}`)

        return {
            allowed: true,
            risk
        }
    }

    /**
     * Inicializa las reglas de seguridad
     */
    private initializeRules(): SecurityRule[] {
        return [
            // Regla 1: Job debe estar en whitelist
            {
                name: 'job_whitelist',
                risk: ActionRisk.FORBIDDEN,
                check: async (action) => {
                    const allowedJobs = this.config.security.allowedJobs

                    if (allowedJobs.length === 0) {
                        // Si no hay whitelist configurada, permitir todo (para desarrollo)
                        return true
                    }

                    return allowedJobs.includes(action.target_job)
                },
                errorMessage: 'Job no está en la lista de jobs permitidos (whitelist)'
            },

            // Regla 2: Validar horario de negocio
            {
                name: 'business_hours',
                risk: ActionRisk.MODERATE,
                check: async (action) => {
                    if (!this.config.security.businessHoursOnly) {
                        return true
                    }

                    const now = new Date()
                    const hour = now.getHours()
                    const day = now.getDay() // 0 = Domingo, 6 = Sábado

                    // Validar que sea día de semana
                    if (day === 0 || day === 6) {
                        return false
                    }

                    // Validar hora
                    const start = this.config.security.businessHoursStart
                    const end = this.config.security.businessHoursEnd

                    return hour >= start && hour < end
                },
                errorMessage: 'Acción solo permitida en horario de negocio (Lunes-Viernes, 8am-6pm)'
            },

            // Regla 3: Límite de acciones concurrentes
            {
                name: 'max_concurrent_actions',
                risk: ActionRisk.MODERATE,
                check: async (action) => {
                    // Esta validación se hace en el executor antes de marcar como RUNNING
                    return true
                },
                errorMessage: 'Límite de acciones concurrentes alcanzado'
            },

            // Regla 4: Validar que el incidente esté en estado correcto (si aplica)
            {
                name: 'incident_acknowledged',
                risk: ActionRisk.MODERATE,
                check: async (action) => {
                    // Si no hay incident_id, permitir (puede ser acción manual)
                    if (!action.incident_id) {
                        return true
                    }

                    // TODO: Consultar estado del incidente en BD
                    // Por ahora permitir
                    return true
                },
                errorMessage: 'El incidente asociado no ha sido reconocido (acknowledged)'
            },

            // Regla 5: Validar tipo de acción según job
            {
                name: 'action_type_validation',
                risk: ActionRisk.MODERATE,
                check: async (action) => {
                    // Acciones STOP son más peligrosas
                    if (action.action_type === ActionType.JENKINS_STOP) {
                        // Solo permitir STOP en jobs de desarrollo/staging
                        const devJobs = ['dev-', 'test-', 'staging-']
                        return devJobs.some(prefix => action.target_job.startsWith(prefix))
                    }

                    return true
                },
                errorMessage: 'Acción STOP solo permitida en jobs de desarrollo/staging'
            },

            // Regla 6: Validar rollback a builds recientes
            {
                name: 'rollback_recency',
                risk: ActionRisk.DANGEROUS,
                check: async (action) => {
                    if (action.action_type !== ActionType.JENKINS_ROLLBACK) {
                        return true
                    }

                    // TODO: Validar que el build target no sea muy antiguo (> 7 días)
                    // Por ahora permitir
                    return true
                },
                errorMessage: 'Rollback solo permitido a builds recientes (< 7 días)'
            }
        ]
    }

    /**
     * Calcula el nivel de riesgo de una acción
     */
    private calculateRisk(action: ActionExecution): ActionRisk {
        // Acciones STOP son siempre peligrosas
        if (action.action_type === ActionType.JENKINS_STOP) {
            return ActionRisk.DANGEROUS
        }

        // Rollback es moderado
        if (action.action_type === ActionType.JENKINS_ROLLBACK) {
            return ActionRisk.MODERATE
        }

        // Restart en jobs de producción es moderado
        if (action.target_job.includes('prod')) {
            return ActionRisk.MODERATE
        }

        // Restart en desarrollo es seguro
        return ActionRisk.SAFE
    }

    /**
     * Agrega una regla personalizada
     */
    addRule(rule: SecurityRule): void {
        this.rules.push(rule)
        console.error(`[ActionGuard] Nueva regla agregada: ${rule.name}`)
    }

    /**
     * Verifica si estamos en modo DRY RUN
     */
    isDryRun(): boolean {
        return this.config.security.dryRun
    }
}