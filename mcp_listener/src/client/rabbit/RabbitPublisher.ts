import { ElasticClient } from '../elastic/ElasticClient';
import { RabbitConnection } from './RabbitConnection';

export class RabbitPublisher {

    private elasticClient!: ElasticClient
    private exchange: string = 'logs'
    private rabbitConnection: RabbitConnection

    constructor(rabbitConnection: RabbitConnection) {
        this.rabbitConnection = rabbitConnection
    }

    //Metodo Factory
    static async create(connectionURL?: string): Promise<RabbitPublisher> {
        const rabbitConnection = await RabbitConnection.create(connectionURL)
        return new RabbitPublisher(rabbitConnection)
    }

    async publishLogs(): Promise<void> {
        try {
            this.elasticClient = await ElasticClient.start()

            this.rabbitConnection.assertExchange(this.exchange, 'topic', {
                durable: true
            })

            const list_msg = await this.elasticClient.getLogsJenkins()
            const channel = this.rabbitConnection.getChannel()
            console.log(list_msg)
            for (const msg of list_msg) {
                channel.publish(this.exchange, msg._index, Buffer.from(JSON.stringify(msg)), {
                    persistent: true
                })
            }
        } catch (error) {
            console.error('Error publicando logs en RabbitMQ', error)
            throw error
        }
    }

    async close(): Promise<void> {
        await this.rabbitConnection.close()
    }
}