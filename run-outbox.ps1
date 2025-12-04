# Script simplificado para ejecutar OutboxProcessor
# Uso: .\run-outbox.ps1

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Iniciando Outbox Processor Service" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Configurar variables de entorno para conexion local
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5432"
$env:POSTGRES_DB = "mcp_logs"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = "postgres"
$env:RABBITMQ_URL = "amqp://localhost:5672"
$env:OUTBOX_PROCESSING_INTERVAL = "5000"
$env:OUTBOX_BATCH_SIZE = "10"

Write-Host "Configuracion:" -ForegroundColor Yellow
Write-Host "  PostgreSQL: localhost:5432/mcp_logs"
Write-Host "  RabbitMQ: localhost:5672"
Write-Host "  Intervalo: 5000ms"
Write-Host ""

# Cambiar al directorio del orchestrator
Set-Location mcp_orchestrator

# Compilar si es necesario
if (-not (Test-Path "dist/outbox-service.js")) {
    Write-Host "Compilando TypeScript..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error en compilacion" -ForegroundColor Red
        exit 1
    }
    Write-Host "Compilado exitosamente" -ForegroundColor Green
    Write-Host ""
}

# Ejecutar el servicio
Write-Host "Ejecutando OutboxProcessor..." -ForegroundColor Green
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""
node dist/outbox-service.js
