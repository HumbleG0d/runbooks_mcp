// Formateador de mensajes de Slack usando Block Kit
// Crea mensajes ricos para notificaciones de incidentes

export interface IncidentDetectedPayload {
    incident_id: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
    job_name: string;
    build_number: number;
    error_message: string;
    detected_at: Date;
}

export interface IncidentResolvedPayload {
    incident_id: number;
    job_name: string;
    build_number: number;
    detected_at: Date;
    resolved_at: Date;
    mttr_minutes: number;
    resolution_method: 'manual' | 'restart' | 'rollback';
    resolved_by?: string;
}

export class SlackFormatter {

    /**
     * Formatea mensaje de incidente detectado
     */
    static formatIncidentDetected(payload: IncidentDetectedPayload) {
        const severityEmoji = this.getSeverityEmoji(payload.severity);
        const severityColor = this.getSeverityColor(payload.severity);

        return {
            channel: process.env.SLACK_INCIDENTS_CHANNEL || 'incidents',
            text: `🚨 Incidente Detectado #${payload.incident_id}`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `🚨 Incidente Detectado #${payload.incident_id}`,
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Pipeline:*\n${payload.job_name}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Build:*\n#${payload.build_number}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Severidad:*\n${severityEmoji} ${payload.severity.toUpperCase()}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Detectado:*\n<!date^${Math.floor(payload.detected_at.getTime() / 1000)}^{time}|${payload.detected_at.toISOString()}>`
                        }
                    ]
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Error:*\n\`\`\`${this.truncateError(payload.error_message)}\`\`\``
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Acciones sugeridas:*'
                    }
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `• \`@owo reinicia el job ${payload.job_name} build ${payload.build_number}\`\n• \`@owo rollback del job ${payload.job_name} al build ${payload.build_number - 1}\``
                    }
                }
            ],
            attachments: [
                {
                    color: severityColor,
                    footer: `Incident ID: ${payload.incident_id}`,
                    ts: Math.floor(payload.detected_at.getTime() / 1000).toString()
                }
            ]
        };
    }

    /**
     * Formatea mensaje de incidente resuelto
     */
    static formatIncidentResolved(payload: IncidentResolvedPayload) {
        const mttrFormatted = this.formatMTTR(payload.mttr_minutes);
        const resolutionEmoji = this.getResolutionEmoji(payload.resolution_method);

        return {
            channel: process.env.SLACK_INCIDENTS_CHANNEL || 'incidents',
            text: `✅ Incidente Resuelto #${payload.incident_id}`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: `✅ Incidente Resuelto #${payload.incident_id}`,
                        emoji: true
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Pipeline:*\n${payload.job_name}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Build:*\n#${payload.build_number}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Método:*\n${resolutionEmoji} ${this.getResolutionText(payload.resolution_method)}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Resuelto por:*\n${payload.resolved_by || 'Sistema automático'}`
                        }
                    ]
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `⏱️ *MTTR:* ${mttrFormatted}`
                    }
                },
                {
                    type: 'divider'
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: this.formatTimeline(payload)
                    }
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '✅ *Estado actual:* Pipeline funcionando normalmente'
                        }
                    ]
                }
            ],
            attachments: [
                {
                    color: '#36a64f', // Verde para resolución
                    footer: `Incident ID: ${payload.incident_id} | MTTR: ${mttrFormatted}`,
                    ts: Math.floor(payload.resolved_at.getTime() / 1000).toString()
                }
            ]
        };
    }

    // Helpers

    private static getSeverityEmoji(severity: string): string {
        const emojis: Record<string, string> = {
            critical: '🔴',
            high: '🟠',
            medium: '🟡',
            low: '🟢'
        };
        return emojis[severity] || '⚪';
    }

    private static getSeverityColor(severity: string): string {
        const colors: Record<string, string> = {
            critical: '#ff0000',
            high: '#ff6600',
            medium: '#ffcc00',
            low: '#00cc00'
        };
        return colors[severity] || '#cccccc';
    }

    private static getResolutionEmoji(method: string): string {
        const emojis: Record<string, string> = {
            restart: '🔄',
            rollback: '⏪',
            manual: '👤'
        };
        return emojis[method] || '✅';
    }

    private static getResolutionText(method: string): string {
        const texts: Record<string, string> = {
            restart: 'Restart automático',
            rollback: 'Rollback',
            manual: 'Resolución manual'
        };
        return texts[method] || 'Resuelto';
    }

    private static formatMTTR(minutes: number): string {
        if (minutes < 1) {
            return `${Math.round(minutes * 60)} segundos`;
        } else if (minutes < 60) {
            return `${minutes.toFixed(1)} minutos`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return `${hours}h ${mins}m`;
        }
    }

    private static formatTimeline(payload: IncidentResolvedPayload): string {
        const detectedTime = payload.detected_at.toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const resolvedTime = payload.resolved_at.toLocaleTimeString('es-PE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        return `*Timeline:*\n• ${detectedTime} - Incidente detectado\n• ${resolvedTime} - ${this.getResolutionText(payload.resolution_method)}\n\n📊 *Tiempo total:* ${this.formatMTTR(payload.mttr_minutes)}`;
    }

    private static truncateError(error: string, maxLength: number = 500): string {
        if (error.length <= maxLength) {
            return error;
        }
        return error.substring(0, maxLength) + '...\n[Error truncado]';
    }
}
