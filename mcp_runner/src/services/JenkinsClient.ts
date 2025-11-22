import fetch from 'node-fetch'
import type { JenkinsJob, JenkinsConfig } from '../types/types'
import type { ActionResult } from '../types/actions'

export class JenkinsClient {
    private baseUrl: string
    private authHeader: string

    constructor(config: JenkinsConfig) {
        this.baseUrl = config.baseUrl.replace(/\/$/, '')
        const auth = Buffer.from(`${config.username}:${config.apiToken}`).toString('base64')
        this.authHeader = `Basic ${auth}`
    }

    /**
     * Verifica la conexión con Jenkins
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/json`, {
                headers: { 'Authorization': this.authHeader }
            })
            return response.ok
        } catch (error) {
            console.error('[Jenkins] Health check failed:', error)
            return false
        }
    }

    /**
     * Obtiene información de un job
     */
    async getJob(jobName: string): Promise<JenkinsJob | null> {
        try {
            const response = await fetch(`${this.baseUrl}/job/${jobName}/api/json`, {
                headers: { 'Authorization': this.authHeader }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const data: any = await response.json()

            return {
                name: data.name,
                url: data.url,
                color: data.color,
                lastBuild: data.lastBuild ? {
                    number: data.lastBuild.number,
                    result: data.lastBuild.result || 'IN_PROGRESS',
                    timestamp: data.lastBuild.timestamp
                } : undefined
            }
        } catch (error) {
            console.error(`[Jenkins] Error getting job ${jobName}:`, error)
            return null
        }
    }

    /**
     * Reinicia un build específico
     */
    async restartBuild(jobName: string, buildNumber: number): Promise<ActionResult> {
        try {
            // En Jenkins, "restart" es simplemente iniciar un nuevo build
            const response = await fetch(`${this.baseUrl}/job/${jobName}/build`, {
                method: 'POST',
                headers: {
                    'Authorization': this.authHeader,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            // Esperar un momento para obtener el nuevo build number
            await new Promise(resolve => setTimeout(resolve, 2000))

            const job = await this.getJob(jobName)
            const newBuildNumber = job?.lastBuild?.number

            return {
                success: true,
                action: 'restart',
                jobName,
                buildNumber: newBuildNumber,
                message: `Build reiniciado exitosamente. Nuevo build: #${newBuildNumber}`,
                timestamp: new Date()
            }
        } catch (error) {
            return {
                success: false,
                action: 'restart',
                jobName,
                buildNumber,
                message: `Error reiniciando build: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            }
        }
    }

    /**
     * Hace rollback a un build anterior (redeploy de un build específico)
     */
    async rollbackToBuild(jobName: string, targetBuildNumber: number): Promise<ActionResult> {
        try {
            // Verificar que el build existe
            const response = await fetch(
                `${this.baseUrl}/job/${jobName}/${targetBuildNumber}/api/json`,
                { headers: { 'Authorization': this.authHeader } }
            )

            if (!response.ok) {
                throw new Error(`Build #${targetBuildNumber} no encontrado`)
            }

            const buildData: any = await response.json()

            if (buildData.result !== 'SUCCESS') {
                throw new Error(`Build #${targetBuildNumber} no fue exitoso (${buildData.result})`)
            }

            // Triggerar replay del build
            const replayResponse = await fetch(
                `${this.baseUrl}/job/${jobName}/${targetBuildNumber}/replay`,
                {
                    method: 'POST',
                    headers: { 'Authorization': this.authHeader }
                }
            )

            if (!replayResponse.ok) {
                // Fallback: trigger nuevo build con parámetros
                await this.triggerBuildWithParams(jobName, {
                    ROLLBACK_TO: targetBuildNumber.toString()
                })
            }

            return {
                success: true,
                action: 'rollback',
                jobName,
                buildNumber: targetBuildNumber,
                message: `Rollback a build #${targetBuildNumber} iniciado exitosamente`,
                timestamp: new Date()
            }
        } catch (error) {
            return {
                success: false,
                action: 'rollback',
                jobName,
                buildNumber: targetBuildNumber,
                message: `Error en rollback: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            }
        }
    }

    /**
     * Detiene un build en ejecución
     */
    async stopBuild(jobName: string, buildNumber: number): Promise<ActionResult> {
        try {
            const response = await fetch(
                `${this.baseUrl}/job/${jobName}/${buildNumber}/stop`,
                {
                    method: 'POST',
                    headers: { 'Authorization': this.authHeader }
                }
            )

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            return {
                success: true,
                action: 'stop',
                jobName,
                buildNumber,
                message: `Build #${buildNumber} detenido exitosamente`,
                timestamp: new Date()
            }
        } catch (error) {
            return {
                success: false,
                action: 'stop',
                jobName,
                buildNumber,
                message: `Error deteniendo build: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            }
        }
    }

    /**
     * Triggerea un build con parámetros
     */
    async triggerBuildWithParams(
        jobName: string,
        params: Record<string, string>
    ): Promise<ActionResult> {
        try {
            const formData = new URLSearchParams()
            Object.entries(params).forEach(([key, value]) => {
                formData.append(key, value)
            })

            const response = await fetch(
                `${this.baseUrl}/job/${jobName}/buildWithParameters`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': this.authHeader,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: formData.toString()
                }
            )

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            return {
                success: true,
                action: 'trigger_build',
                jobName,
                message: `Build trigereado con parámetros: ${JSON.stringify(params)}`,
                timestamp: new Date()
            }
        } catch (error) {
            return {
                success: false,
                action: 'trigger_build',
                jobName,
                message: `Error trigereando build: ${error instanceof Error ? error.message : 'Unknown error'}`,
                timestamp: new Date()
            }
        }
    }

    /**
     * Lista todos los jobs
     */
    async listJobs(): Promise<JenkinsJob[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/json?tree=jobs[name,url,color,lastBuild[number,result,timestamp]]`, {
                headers: { 'Authorization': this.authHeader }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data: any = await response.json()

            return data.jobs.map((job: any) => ({
                name: job.name,
                url: job.url,
                color: job.color,
                lastBuild: job.lastBuild ? {
                    number: job.lastBuild.number,
                    result: job.lastBuild.result || 'IN_PROGRESS',
                    timestamp: job.lastBuild.timestamp
                } : undefined
            }))
        } catch (error) {
            console.error('[Jenkins] Error listing jobs:', error)
            return []
        }
    }
}