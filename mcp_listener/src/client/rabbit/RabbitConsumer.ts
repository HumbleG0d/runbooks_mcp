import { handleLogMCP } from "../../handlers/log_handler"
import { RabbitConnection } from "./RabbitConnection"
import * as amqp from 'amqplib'

export class RabbitConsumer {
    private rabbitConnection: RabbitConnection
    private exchange: string = 'logs'

    constructor(rabbitConnection: RabbitConnection) {
        this.rabbitConnection = rabbitConnection
    }

    static async create(connectionURL?: string): Promise<RabbitConsumer> {
        const rabbitConnection = await RabbitConnection.create(connectionURL)
        return new RabbitConsumer(rabbitConnection)
    }

    async consumeLogs(): Promise<void> {
        try {
            this.rabbitConnection.assertExchange(this.exchange, 'topic', {
                durable: true
            })

            const q = await this.rabbitConnection.assertQueue('', {
                exclusive: true
            })

            const channel = this.rabbitConnection.getChannel()

            await channel.bindQueue(q.queue, this.exchange, 'logs.jenkins.*')

            await channel.consume(q.queue, (msg: amqp.ConsumeMessage | null) => {
                if (msg === null) {
                    console.log("MENSAJE NULO")
                    return
                }
                try {
                    const content = msg?.content.toString()
                    const json = JSON.parse(content)
                    console.log(json)
                    handleLogMCP(json)
                } catch (error) {
                    console.error('Erro procesando mensaje')
                }
            }, {
                noAck: true
            })
        } catch (error) {
            console.error('Erro consumiendo logs de RabbitMQ', error)
        }
    }

    async consumeLogsAPI(): Promise<void> {
        try {
            this.rabbitConnection.assertExchange(this.exchange, 'topic', {
                durable: true
            })

            const q = await this.rabbitConnection.assertQueue('', {
                exclusive: true
            })

            const channel = this.rabbitConnection.getChannel()

            await channel.bindQueue(q.queue, this.exchange, 'logs.api.*')

            await channel.consume(q.queue, (msg: amqp.ConsumeMessage | null) => {
                if (msg === null) {
                    console.log("MENSAJE NULO")
                    return
                }
                try {
                    const content = msg?.content.toString()
                    const json = JSON.parse(content)
                    console.log(json)
                    handleLogMCP(json)
                } catch (error) {
                    console.error('Erro procesando mensaje')
                }
            }, {
                noAck: true
            })
        } catch (error) {
            console.error('Erro consumiendo logs de RabbitMQ', error)
        }
    }

    async close(): Promise<void> {
        await this.rabbitConnection.close()
    }
}