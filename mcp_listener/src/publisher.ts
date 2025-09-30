import { RabbitPublisher } from "./client/rabbit/RabbitPublisher"
const URL = "amqp://localhost:5672"

async function runPublisher() {
    console.log('Iniciando Publisher Service...\n');

    const publisher = await RabbitPublisher.create(URL);

    try {
        console.log('Publicando logs...');
        await publisher.publishLogsAPI();
        console.log('Logs publicados');
    } catch (error) {
        console.error('Error en publisher:', error);
        await publisher.close();
        process.exit(1);
    }
}
runPublisher()