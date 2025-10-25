import { RabbitPublisher } from './client/rabbit/RabbitPublisher'
const URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672'

async function runPublisher() {
  console.log('Iniciando Publisher Service...\n')

  const publisher = await RabbitPublisher.create(URL)

  try {
    console.log('Publicando logs de API...')
    await publisher.publishLogsAPI()
    console.log('Logs de API publicados')

    console.log('Publicando logs de Jenkins...')
    await publisher.publishLogs()
    console.log('Logs de Jenkins publicados')
  } catch (error) {
    console.error('Error en publisher:', error)
    await publisher.close()
    process.exit(1)
  }
}
runPublisher()
