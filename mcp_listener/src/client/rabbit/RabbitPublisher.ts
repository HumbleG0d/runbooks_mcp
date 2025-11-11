import { ResponseToRabbitAPI, ResponseToRabbitJenkins } from '../../types/types'
import { ElasticClient } from '../elastic/ElasticClient'
import { RabbitConnection } from './RabbitConnection'

export class RabbitPublisher {
  private elasticClient!: ElasticClient
  private exchange: string = 'logs'
  private rabbitConnection: RabbitConnection

  constructor(rabbitConnection: RabbitConnection) {
    this.rabbitConnection = rabbitConnection
  }

  static async create(connectionURL?: string): Promise<RabbitPublisher> {
    const rabbitConnection = await RabbitConnection.create(connectionURL)
    return new RabbitPublisher(rabbitConnection)
  }

  /**
   * Determina el nivel del log basado en el contenido
   */
  private getLogLevel(msg: ResponseToRabbitJenkins): string {
    // Primero intenta obtener el nivel de los campos del mensaje
    if (msg.level) {
      return msg.level.toLowerCase()
    }

    // Si no hay campo level, intenta detectarlo del mensaje
    const message = (msg.message || '').toLowerCase()

    if (message.includes('error') || message.includes('failed') || message.includes('exception')) {
      return 'error'
    }
    if (message.includes('warning') || message.includes('warn')) {
      return 'warning'
    }
    if (message.includes('success') || message.includes('completed')) {
      return 'success'
    }
    if (message.includes('debug')) {
      return 'debug'
    }

    // Default
    return 'info'
  }

  async publishLogs(): Promise<void> {
    try {
      console.log('Iniciando publicación de logs de Jenkins...')

      this.elasticClient = await ElasticClient.start()

      await this.rabbitConnection.assertExchange(this.exchange, 'topic', {
        durable: true,
      })
      console.log('Exchange configurado')

      const list_msg = await this.elasticClient.getLogsJenkins()
      console.log(`Total de logs obtenidos: ${list_msg.length}`)

      const channel = this.rabbitConnection.getChannel()

      let publishedCount = 0

      for (const msg of list_msg) {
        // Obtener el nivel del log
        const level = this.getLogLevel(msg)

        // Construir el routing key correcto: logs.jenkins.{nivel}
        const routingKey = `logs.jenkins.${level}`

        const messageBuffer = Buffer.from(JSON.stringify(msg))

        // Publicar el mensaje
        const published = channel.publish(
          this.exchange,
          routingKey,
          messageBuffer,
          {
            persistent: true,
            contentType: 'application/json',
          }
        )

        if (published) {
          publishedCount++
          console.log(`[${publishedCount}/${list_msg.length}] Publicado: ${routingKey}`)
        } else {
          console.log(`Buffer lleno, esperando...`)
          await new Promise(resolve => channel.once('drain', resolve))
        }
      }

      // Esperar confirmaciones
      console.log(`\n${publishedCount} logs de Jenkins publicados correctamente`)

    } catch (error) {
      console.error('Error publicando logs de Jenkins:', error)
      throw error
    }
  }

  private getAPILogLevel(msg: ResponseToRabbitAPI): string {
    // Similar lógica para logs de API
    // if (msg.level) {
    //   return msg.level.toLowerCase()
    // }

    const message = (msg.message || '').toLowerCase()

    // Detectar por código de estado HTTP si existe
    // if (msg.statusCode) {
    //   const code = Number(msg.statusCode)
    //   if (code >= 500) return 'error'
    //   if (code >= 400) return 'warning'
    //   if (code >= 200 && code < 300) return 'success'
    // }

    if (message.includes('error') || message.includes('failed')) {
      return 'error'
    }
    if (message.includes('warning') || message.includes('warn')) {
      return 'warning'
    }

    return 'info'
  }

  async publishLogsAPI(): Promise<void> {
    try {
      console.log('Iniciando publicación de logs de API...')

      this.elasticClient = await ElasticClient.start()

      await this.rabbitConnection.assertExchange(this.exchange, 'topic', {
        durable: true,
      })
      console.log('Exchange configurado')

      const list_msg = await this.elasticClient.getLogsApi()
      console.log(`Total de logs obtenidos: ${list_msg.length}`)

      const channel = this.rabbitConnection.getChannel()

      let publishedCount = 0

      for (const msg of list_msg) {
        const level = this.getAPILogLevel(msg)

        // Routing key: logs.api.{nivel}
        const routingKey = `logs.api.${level}`

        const messageBuffer = Buffer.from(JSON.stringify(msg))

        const published = channel.publish(
          this.exchange,
          routingKey,
          messageBuffer,
          {
            persistent: true,
            contentType: 'application/json',
          }
        )

        if (published) {
          publishedCount++
          console.log(`[${publishedCount}/${list_msg.length}] Publicado: ${routingKey}`)
        } else {
          console.log(`Buffer lleno, esperando...`)
          await new Promise(resolve => channel.once('drain', resolve))
        }
      }

      console.log(`\n${publishedCount} logs de API publicados correctamente`)

    } catch (error) {
      console.error('Error publicando logs de API:', error)
      throw error
    }
  }

  async publishAll(): Promise<void> {
    console.log('Publicando todos los logs...\n')
    await this.publishLogsAPI()
    console.log('\n')
    await this.publishLogs()
    console.log('\nTodos los logs publicados')
  }

  async close(): Promise<void> {
    await this.rabbitConnection.close()
  }
}