export interface ToolResponse {
  content: Array<{
    type: 'text'
    text: string
  }>
  [key: string]: unknown
}

export interface ResponseToRabbitJenkins {
  _index: string
  '@timestamp': Date
  level: string
  message: string
}

export interface ResponseToRabbitAPI {
  _index: string
  '@timestamp': Date
  message: string
  http_method: string
  http_status: number
}
