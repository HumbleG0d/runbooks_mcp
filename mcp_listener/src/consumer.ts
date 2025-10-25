import { RabbitConsumer } from './client/rabbit/RabbitConsumer'
const URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672'

async function runConsumer() {
  console.log('Iniciando Consumer Service...\n')

  const consumer = await RabbitConsumer.create(URL)

  try {
    // Consumir API y Jenkins en paralelo
    await Promise.all([
      consumer.consumeLogsAPI(),
      consumer.consumeLogs()
    ])

    console.log('Consumer Service iniciado')
    console.log('Esperando mensajes...')

    process.on('SIGINT', async () => {
      console.log('\nDeteniendo consumer...')
      await consumer.close()
      process.exit(0)
    })
  } catch (error) {
    console.error('Error en consumer:', error)
    await consumer.close()
    process.exit(1)
  }
}
runConsumer()
