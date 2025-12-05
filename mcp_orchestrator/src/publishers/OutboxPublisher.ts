// publishers/OutboxPublisher.ts
import { OutboxEvent, OutboxEventType } from '../types/outbox'

/**
 * Interfaz para diferentes estrategias de publicación
 * Puedes implementar: RabbitMQ, Kafka, AWS SNS/SQS, etc.
 */
export interface EventPublisher {
    publish(event: OutboxEvent): Promise<void>
    connect(): Promise<void>
    disconnect(): Promise<void>
}

/**
 * Implementación de ejemplo con RabbitMQ
 * Reemplaza con tu broker real
 */
export class RabbitMQPublisher implements EventPublisher {
    private connection: any = null
    private channel: any = null
    private readonly exchangeName = 'logs.events'

    constructor(private rabbitUrl: string) {
        this.rabbitUrl = "amqp://localhost:5672"
    }

    async connect(): Promise<void> {
        try {
            // Descomenta cuando uses amqplib real
            const amqp = require('amqplib')
            this.connection = await amqp.connect(this.rabbitUrl)
            this.channel = await this.connection.createChannel()
            await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true })

            console.error('RabbitMQ Publisher conectado')
        } catch (error) {
            console.error('Error conectando RabbitMQ Publisher:', error)
            throw error
        }
    }

    async publish(event: OutboxEvent): Promise<void> {
        try {
            const routingKey = this.getRoutingKey(event.event_type)
            const message = {
                eventId: event.id,
                eventType: event.event_type,
                aggregateId: event.aggregate_id,
                timestamp: event.created_at,
                payload: event.payload
            }

            // Descomenta cuando uses amqplib real
            this.channel.publish(
                this.exchangeName,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            )

            // Por ahora solo logueamos
            console.error(`Evento publicado: ${event.event_type} [${event.id}]`, {
                routingKey,
                aggregateId: event.aggregate_id
            })

            // Simula delay de red
            await new Promise(resolve => setTimeout(resolve, 10))
        } catch (error) {
            console.error(`Error publicando evento ${event.id}:`, error)
            throw error
        }
    }

    async disconnect(): Promise<void> {
        try {
            await this.channel?.close()
            await this.connection?.close()
            console.error('RabbitMQ Publisher desconectado')
        } catch (error) {
            console.error('Error desconectando RabbitMQ Publisher:', error)
        }
    }

    private getRoutingKey(eventType: OutboxEventType): string {
        const routes: Record<OutboxEventType, string> = {
            [OutboxEventType.JENKINS_LOG_CREATED]: 'logs.jenkins.created',
            [OutboxEventType.API_LOG_CREATED]: 'logs.api.created',
            [OutboxEventType.LOGS_BATCH_PROCESSED]: 'logs.batch.processed',
            [OutboxEventType.INCIDENT_DETECTED]: 'incident.detected',
            [OutboxEventType.INCIDENT_RESOLVED]: 'incident.resolved', // NEW
            [OutboxEventType.ACTION_REQUESTED]: 'actions.requested'
        }
        return routes[eventType] || 'logs.unknown'
    }
}

/**
 * Publisher de consola para testing
 */
export class ConsolePublisher implements EventPublisher {
    async connect(): Promise<void> {
        console.error('Console Publisher conectado')
    }

    async publish(event: OutboxEvent): Promise<void> {
        console.error('[CONSOLE PUBLISHER] Evento:', {
            id: event.id,
            type: event.event_type,
            aggregateId: event.aggregate_id,
            payload: event.payload
        })
    }

    async disconnect(): Promise<void> {
        console.error('Console Publisher desconectado')
    }
}