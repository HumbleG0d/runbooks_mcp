import * as amqp from 'amqplib'
import { ActionEvent } from '../types/actions'
import { ActionExecutor } from '../services/ActionExecutor'
import { ActionRepository } from '../db/ActionRepository'
import { Config } from '../config/Config'

export class ActionConsumer {
    private connection: any = null
    private channel: any = null
    private config: Config

    constructor(
        private actionRepo: ActionRepository,
        private actionExecutor: ActionExecutor
    ) {
        this.config = Config.getInstance()
    }

    /**
     * Conecta a RabbitMQ e inicia el consumer
     */
    async start(): Promise<void> {
        try {
            console.error('[ActionConsumer] Conectando a RabbitMQ...')
            const amqp = require('amqplib')

            // Conectar a RabbitMQ
            this.connection = await amqp.connect(this.config.rabbitmq.url)
            this.channel = await this.connection.createChannel()

            console.error('[ActionConsumer] Conectado a RabbitMQ')

            // Configurar exchange y queue
            const exchange = this.config.rabbitmq.exchangeName
            const queueName = this.config.rabbitmq.queueName

            // Crear exchange (tipo topic para routing flexible)
            await this.channel.assertExchange(exchange, 'topic', { durable: true })

            // Crear queue durable
            await this.channel.assertQueue(queueName, {
                durable: true,
                arguments: {
                    'x-message-ttl': 3600000, // 1 hora TTL para mensajes
                    'x-max-length': 10000     // Máximo 10k mensajes en cola
                }
            })

            // Bind queue a routing keys de acciones
            await this.channel.bindQueue(queueName, exchange, 'actions.jenkins.*')
            // CORRECCIÓN: la Outbox publica a 'actions.requested' (plural)
            await this.channel.bindQueue(queueName, exchange, 'actions.requested')

            console.error(`[ActionConsumer] Queue configurada: ${queueName}`)
            console.error(`[ActionConsumer] Listening on: actions.jenkins.*, actions.requested`)

            // Configurar prefetch (procesar 1 mensaje a la vez)
            await this.channel.prefetch(1)

            // Empezar a consumir mensajes
            await this.channel.consume(queueName, async (msg: amqp.Message | null) => {
                if (!msg) return

                try {
                    await this.handleMessage(msg)
                    this.channel!.ack(msg)
                } catch (error) {
                    console.error('[ActionConsumer] Error procesando mensaje:', error)

                    // Rechazar y reencolar (hasta 3 reintentos)
                    const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) as number

                    if (retryCount < 3) {
                        console.error(`[ActionConsumer] Reencolando mensaje (retry ${retryCount + 1}/3)`)
                        this.channel!.nack(msg, false, true)
                    } else {
                        console.error('[ActionConsumer] Máximo de reintentos alcanzado, descartando mensaje')
                        this.channel!.nack(msg, false, false) // No reencolar
                    }
                }
            })

            console.error('[ActionConsumer] Escuchando mensajes...\n')

            // Manejo de errores de conexión
            this.connection.on('error', (error: unknown) => {
                console.error('[ActionConsumer] Error de conexión:', error)
            })

            this.connection.on('close', () => {
                console.error('[ActionConsumer] Conexión cerrada, reconectando en 5s...')
                setTimeout(() => this.start(), 5000)
            })

        } catch (error) {
            console.error('[ActionConsumer] Error iniciando consumer:', error)
            throw error
        }
    }

    /**
     * Procesa un mensaje de RabbitMQ
     */
    private async handleMessage(msg: amqp.Message): Promise<void> {
        const content = msg.content.toString()
        const routingKey = msg.fields.routingKey

        console.error(`[ActionConsumer] Mensaje recibido (${routingKey})`)

        try {
            const message = JSON.parse(content)

            // El mensaje puede venir en dos formatos:
            // 1. Desde Outbox: { eventId, eventType, payload: { action_id, ... } }
            // 2. Directo: { action_id, action_type, ... }
            let actionId: number

            if (message.payload && message.payload.action_id) {
                // Formato desde Outbox
                actionId = message.payload.action_id
                console.error(`[ActionConsumer] Evento Outbox #${message.eventId} -> Acción #${actionId}`)
            } else if (message.action_id) {
                // Formato directo
                actionId = message.action_id
                console.error(`[ActionConsumer] Procesando acción #${actionId}`)
            } else {
                throw new Error(`Mensaje inválido: no se encontró action_id. Mensaje: ${content}`)
            }

            // Obtener la acción de la BD
            const action = await this.actionRepo.getActionById(actionId)

            if (!action) {
                throw new Error(`Acción #${actionId} no encontrada en BD`)
            }

            // Ejecutar la acción
            await this.actionExecutor.execute(action)

            console.error(`[ActionConsumer] Acción #${actionId} procesada\n`)

        } catch (error) {
            console.error('[ActionConsumer] Error procesando mensaje:', error)
            throw error
        }
    }

    /**
     * Detiene el consumer
     */
    async stop(): Promise<void> {
        try {
            console.error('[ActionConsumer] Deteniendo consumer...')

            if (this.channel) {
                await this.channel.close()
            }

            if (this.connection) {
                await this.connection.close()
            }

            console.error('[ActionConsumer] Consumer detenido')
        } catch (error) {
            console.error('[ActionConsumer] Error deteniendo consumer:', error)
            throw error
        }
    }

    /**
     * Publica un resultado de acción (opcional - para notificaciones)
     */
    async publishResult(actionId: number, success: boolean, details: any): Promise<void> {
        if (!this.channel) {
            console.warn('[ActionConsumer] Canal no disponible para publicar resultado')
            return
        }

        try {
            const exchange = this.config.rabbitmq.exchangeName
            const routingKey = success ? 'actions.jenkins.completed' : 'actions.jenkins.failed'

            const message = {
                action_id: actionId,
                success,
                timestamp: new Date().toISOString(),
                details
            }

            this.channel.publish(
                exchange,
                routingKey,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            )

            console.error(`[ActionConsumer] Resultado publicado: ${routingKey}`)
        } catch (error) {
            console.error('[ActionConsumer] Error publicando resultado:', error)
        }
    }
}