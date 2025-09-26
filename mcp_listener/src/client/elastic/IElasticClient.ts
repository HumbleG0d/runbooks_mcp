import { ResponseToRabbitJenkins, ResponseToRabbitAPI } from "../../types/types"

export interface IElasticClient {
    getLogsJenkins(): Promise<ResponseToRabbitJenkins[]>

    getLogsApi(): Promise<ResponseToRabbitAPI[]>
}