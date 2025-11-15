import { RabbitPublisher } from './client/rabbit/RabbitPublisher'
const URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672'

async function runPublisher() {
  console.log('Iniciando Publisher Service...\n')

  const publisher = await RabbitPublisher.create(URL)

  try {
    // Publicar logs de Jenkins
    console.log('Publicando logs de Jenkins...')
    await publisher.publishLogs()
    console.log('Logs de Jenkins publicados\n')

    // Publicar logs de API
    console.log('Publicando logs de API...')
    await publisher.publishLogsAPI()
    console.log('Logs de API publicados\n')

    // IMPORTANTE: Esperar un poco antes de cerrar para asegurar que los mensajes se envíen
    console.log('Esperando confirmación de mensajes...')
    await new Promise(resolve => setTimeout(resolve, 2000))

  } catch (error) {
    console.error('Error en publisher:', error)
  } finally {
    await publisher.close()
    console.log('Publisher cerrado correctamente')
    process.exit(0)
  }
}

runPublisher()