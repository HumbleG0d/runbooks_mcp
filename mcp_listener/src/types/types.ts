interface Total {
    value: number
    relation: string
}

interface Log {
    level: string
}

interface Error {
    stack_trace: string
}

enum Method {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH"
}

interface Request {
    method: Method
}

interface Response {
    status_code: number
}

interface HTTP {
    request: Request
    response: Response
}

interface Source {
    log?: Log
    message?: string
    "@timestamp": Date
    erro?: Error
    http: HTTP
}

export interface Hits {
    total: Total
    hits: Hit[]
}

export interface Hit {
    _index: string
    _id: string
    _source: Source
}

//Estructura de retorno para Rabbit
export interface ResponseToRabbitJenkins {
    _index: string
    "@timestamp": Date
    level: string
    message: string
}

export interface ResponseToRabbitAPI {
    _index: string
    "@timestamp": Date
    message: string
    http_method: Method
    http_status: number
}