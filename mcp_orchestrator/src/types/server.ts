export interface ServerConfig {
    name: string
    version: string
    httpPort: number
    mode: 'mcp' | 'http' | 'hybrid'
  }
  
  export interface DatabaseConfig {
    host: string
    port: number
    database: string
    user: string
    password: string
    maxConnections: number
  }
  
  export interface MCPTool {
    name: string
    description: string
    inputSchema: Record<string, any>
  }
  
  export interface MCPToolResponse {
    content: Array<{
      type: 'text'
      text: string
    }>
  }
  
  export interface ServerStatus {
    server: {
      name: string
      version: string
      uptime: string
      port: number
    }
    memory: {
      used: string
      total: string
      external: string
    }
    database: {
      jenkins_logs_available: boolean
      api_logs_available: boolean
    }
    timestamp: string
  }
  
  export interface LogFilter {
    limit?: number
    level?: string
    status?: number
  }