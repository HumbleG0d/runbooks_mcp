// Incident Notifier Service
// Escucha eventos de RabbitMQ y envía notificaciones a Slack

import * as amqp from 'amqplib';
import { WebClient } from '@slack/web-api';
import { SlackFormatter, IncidentDetectedPayload, IncidentResolvedPayload } from './slack-formatter';

// Configuración
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const INCIDENTS_QUEUE = 'incident_notifications';
const INCIDENTS_EXCHANGE = 'logs.events';

if (!SLACK_BOT_TOKEN) {
    console.error('❌ SLACK_BOT_TOKEN no configurado');
    process.exit(1);
}

const slackClient = new WebClient(SLACK_BOT_TOKEN);

class IncidentNotifier {
    private connection: any = null;
    private channel: any = null;

    async start() {
        try {
            console.log('🔔 Iniciando Incident Notifier...');

            // Conectar a RabbitMQ
            await this.connectRabbitMQ();

            // Configurar cola y bindings
            await this.setupQueue();

            // Empezar a consumir mensajes
            await this.consumeMessages();

            console.log('✅ Incident Notifier iniciado correctamente');
            console.log(`📬 Escuchando en cola: ${INCIDENTS_QUEUE}`);

        } catch (error) {
            console.error('❌ Error iniciando Incident Notifier:', error);
            process.exit(1);
        }
    }

    private async connectRabbitMQ() {
        console.log(`🔌 Conectando a RabbitMQ: ${RABBITMQ_URL}`);
        this.connection = await amqp.connect(RABBITMQ_URL);
        this.channel = await this.connection.createChannel();
        console.log('✅ Conectado a RabbitMQ');
    }

    private async setupQueue() {
        if (!this.channel) throw new Error('Canal no inicializado');

        // Asegurar que el exchange existe
        await this.channel.assertExchange(INCIDENTS_EXCHANGE, 'topic', { durable: true });

        // Crear cola para notificaciones de incidentes
        await this.channel.assertQueue(INCIDENTS_QUEUE, { durable: true });

        // Bind para eventos de incidentes
        await this.channel.bindQueue(INCIDENTS_QUEUE, INCIDENTS_EXCHANGE, 'incident.detected');
        await this.channel.bindQueue(INCIDENTS_QUEUE, INCIDENTS_EXCHANGE, 'incident.resolved');

        console.log(`✅ Cola ${INCIDENTS_QUEUE} configurada`);
    }

    private async consumeMessages() {
        if (!this.channel) throw new Error('Canal no inicializado');

        console.log('🔧 Configurando consumer...');

        await this.channel.consume(INCIDENTS_QUEUE, async (msg: any) => {
            console.log('📥 Mensaje RAW recibido de RabbitMQ');

            if (!msg) {
                console.log('⚠️  Mensaje es null, ignorando');
                return;
            }

            try {
                console.log('🔍 Parseando contenido del mensaje...');
                const message = JSON.parse(msg.content.toString());
                console.log('📦 Mensaje parseado:', JSON.stringify(message, null, 2));

                const routingKey = msg.fields.routingKey;
                console.log(`📨 Routing key: ${routingKey}`);

                // OutboxPublisher envuelve el payload en un objeto con eventId, eventType, payload, etc.
                // Necesitamos extraer el payload real
                const payload = message.payload || message;
                console.log('🎯 Payload extraído:', JSON.stringify(payload, null, 2));

                await this.handleEvent(routingKey, payload);

                this.channel!.ack(msg);
                console.log(`✅ Evento procesado y ACK enviado: ${routingKey}`);

            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
                console.error('Stack trace:', (error as Error).stack);
                // Rechazar mensaje y no reencolar (evitar loops infinitos)
                this.channel!.nack(msg, false, false);
            }
        });

        console.log('✅ Consumer configurado y listo');
    }

    private async handleEvent(eventType: string, payload: any) {
        switch (eventType) {
            case 'incident.detected':
                await this.notifyIncidentDetected(payload);
                break;

            case 'incident.resolved':
                await this.notifyIncidentResolved(payload);
                break;

            default:
                console.log(`⚠️  Tipo de evento desconocido: ${eventType}`);
        }
    }

    private async notifyIncidentDetected(payload: IncidentDetectedPayload) {
        try {
            console.log(`🚨 Notificando incidente detectado #${payload.incident_id}`);

            // Convertir string a Date si es necesario
            if (typeof payload.detected_at === 'string') {
                payload.detected_at = new Date(payload.detected_at);
            }

            const message = SlackFormatter.formatIncidentDetected(payload);

            const result = await slackClient.chat.postMessage(message);

            console.log(`✅ Notificación enviada a Slack (ts: ${result.ts})`);

        } catch (error) {
            console.error('❌ Error enviando notificación de detección:', error);
            throw error;
        }
    }

    private async notifyIncidentResolved(payload: IncidentResolvedPayload) {
        try {
            console.log(`✅ Notificando incidente resuelto #${payload.incident_id}`);

            // Convertir strings a Date si es necesario
            if (typeof payload.detected_at === 'string') {
                payload.detected_at = new Date(payload.detected_at);
            }
            if (typeof payload.resolved_at === 'string') {
                payload.resolved_at = new Date(payload.resolved_at);
            }

            const message = SlackFormatter.formatIncidentResolved(payload);

            const result = await slackClient.chat.postMessage(message);

            console.log(`✅ Notificación de resolución enviada (ts: ${result.ts})`);
            console.log(`⏱️  MTTR: ${payload.mttr_minutes.toFixed(2)} minutos`);

        } catch (error) {
            console.error('❌ Error enviando notificación de resolución:', error);
            throw error;
        }
    }

    async stop() {
        console.log('🛑 Deteniendo Incident Notifier...');

        if (this.channel) {
            await this.channel.close();
        }

        if (this.connection) {
            await this.connection.close();
        }

        console.log('✅ Incident Notifier detenido');
    }
}

// Iniciar servicio
const notifier = new IncidentNotifier();

notifier.start().catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});

// Manejo de señales para shutdown graceful
process.on('SIGINT', async () => {
    console.log('\n📛 SIGINT recibido, deteniendo...');
    await notifier.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n📛 SIGTERM recibido, deteniendo...');
    await notifier.stop();
    process.exit(0);
});
