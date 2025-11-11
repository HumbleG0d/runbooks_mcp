import * as amqp from 'amqplib'

export class RabbitConnection {
    private connection!: amqp.ChannelModel
    private channel!: amqp.Channel
    private connectionURL: string

    constructor(connectionURL: string) {
        this.connectionURL = connectionURL
    }

    static async create(
        connectionURL = 'amqp://localhost'
    ): Promise<RabbitConnection> {
        const client = new RabbitConnection(connectionURL)
        await client.initialize()
        return client
    }

    private async initialize(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.connectionURL)
            this.channel = await this.connection.createChannel()
        } catch (error) {
            console.error('Error conectando RabbiMQ', error)
            throw error
        }
    }

    getChannel(): amqp.Channel {
        return this.channel
    }

    async assertExchange(
        exchange: string,
        topic: string,
        options: amqp.Options.AssertExchange
    ): Promise<void> {
        await this.channel.assertExchange(exchange, topic, options)
    }

    async assertQueue(
        queue: string,
        options: amqp.Options.AssertQueue
    ): Promise<amqp.Replies.AssertQueue> {
        return this.channel.assertQueue(queue, options)
    }

    async close(): Promise<void> {
        try {
            if (this.connection) await this.connection.close()
            console.log('RabbitMQ desconectado')
        } catch (error) {
            console.error('Error cerrando RabbitMQ', error)
        }
    }
}