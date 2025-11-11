import * as amqp from 'amqplib'
import { RabbitConnection } from './RabbitConnection'
import { handleLogJenkinsMCP } from '../../handlers/log_handler'
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
      console.log(`Configurando exchange: ${this.exchange}`)

      await this.rabbitConnection.assertExchange(this.exchange, 'topic', {
        durable: true,
      })

      console.log('Exchange configurado')

      const q = await this.rabbitConnection.assertQueue('', {
        exclusive: true,
      })

      console.log(`Cola creada: ${q.queue}`)

      const channel = this.rabbitConnection.getChannel()

      const routingKey = 'logs.jenkins.*'
      await channel.bindQueue(q.queue, this.exchange, routingKey)

      console.log(`Cola vinculada al exchange con routing key: ${routingKey}`)

      await channel.consume(
        q.queue,
        (msg: amqp.ConsumeMessage | null) => {
          if (msg === null) {
            console.log('MENSAJE NULO recibido')
            return
          }

          try {
            console.log(`Mensaje recibido - Routing Key: ${msg.fields.routingKey}`)
            const content = msg.content.toString()
            console.log(`Contenido: ${content.substring(0, 100)}...`)

            const json = JSON.parse(content)
            console.log('JSON parseado correctamente')
            console.log(json)

            handleLogJenkinsMCP(json)
          } catch (error) {
            console.error('Error procesando mensaje:', error)
            console.error('Contenido del mensaje:', msg.content.toString())
          }
        },
        {
          noAck: true,
        }
      )

      console.log('Consumer configurado y escuchando mensajes')

    } catch (error) {
      console.error('Error consumiendo logs de RabbitMQ:', error)
      throw error
    }
  }

  async close(): Promise<void> {
    await this.rabbitConnection.close()
  }
}