import { RabbitConsumer } from './client/rabbit/RabbitConsumer'
const URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672'

async function runConsumer() {
  console.log('Iniciando Consumer Service...\n')

  const consumer = await RabbitConsumer.create(URL)

  try {
    // IMPORTANTE: Agregar await para asegurar que el consumer se inicie correctamente
    await consumer.consumeLogs()
    console.log('Consumer Service iniciado correctamente')
    console.log('Esperando mensajes...\n')

    // Mantener el proceso vivo
    process.on('SIGINT', async () => {
      console.log('\nDeteniendo consumer...')
      await consumer.close()
      process.exit(0)
    })

    // Prevenir que el proceso termine
    await new Promise(() => { })

  } catch (error) {
    console.error('Error en consumer:', error)
    await consumer.close()
    process.exit(1)
  }
}

runConsumer()