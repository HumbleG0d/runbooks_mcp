import { IElasticClient } from './IElasticClient'
import {
  Hits,
  ResponseToRabbitAPI,
  ResponseToRabbitJenkins,
} from '../../types/types'
import { Client as Client8 } from '@elastic/elasticsearch'

export class ElasticClient implements IElasticClient {
  private client!: Client8
  private lastCheck: Date

  constructor(client: Client8) {
    this.client = client
    this.lastCheck = new Date()
  }

  static async start(): Promise<ElasticClient> {
    const cl = new Client8({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      auth: {
        username: 'elastic',
        password: 'somethingsecret',
      },
    })
    return new ElasticClient(cl)
  }

  private normalizeIndex(index: string): string {
    if (index.includes('jenkins')) {
      const parts = index.split('.')
      const jenkinsIndex = parts.findIndex((part) => part.includes('jenkins'))

      if (jenkinsIndex !== -1 && parts[jenkinsIndex + 1]) {
        return `logs.jenkins`
      }
      return 'logs.jenkins.default'
    }
    if (index.includes('api')) {
      const parts = index.split('.')
      const apiIndex = parts.findIndex((part) => part.includes('api'))
      if (apiIndex !== -1) return `logs.api.${parts[apiIndex]}`
      return 'logs.api.default'
    }

    return 'logs.unknown.default'
  }

  // Obtener los logs mas importantes , errores y warnings
  //TODO: Cambiar el @timestep  solo logs recientes
  async getLogsJenkins(): Promise<ResponseToRabbitJenkins[]> {
    try {
      const response = await this.client.search({
        query: {
          bool: {
            must: [{ match: { 'service.name': 'jenkins' } }],
            should: [
              { match: { 'log.level': 'ERROR' } },
              { match: { 'log.level': 'WARN' } },
              { match: { message: 'failed' } },
              { match: { message: 'exception' } },
              { match: { message: 'timeout' } },
              { match: { message: 'build' } },
            ],
            minimum_should_match: 1,
            filter: [
              {
                range: {
                  '@timestamp': {
                    gte: 'now-24h',
                    lte: 'now',
                  },
                },
              },
            ],
          },
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: 50,
        _source: [
          '@timestamp',
          'message',
          'log.level',
          'jenkins.job.name',
          'jenkins.build.number',
          'jenkins.build.status',
          'host.name',
        ],
      })

      const data = response.hits as Hits
      const responseToRabbit: ResponseToRabbitJenkins[] = data.hits.map(
        (hit) => ({
          _index: this.normalizeIndex(hit._index),
          '@timestamp': hit._source['@timestamp'],
          level: hit._source.log ? hit._source.log.level : 'N/A',
          message: hit._source.message ? hit._source.message : 'N/A',
        })
      )

      return responseToRabbit
    } catch (error) {
      throw new Error('Error getting logs from Elasticsearch: ' + error)
    }
  }

  async getLogsApi(): Promise<ResponseToRabbitAPI[]> {
    try {
      const response = await this.client.search({
        query: {
          bool: {
            must: [{ match: { 'service.name': 'express-metrics-api' } }],
            should: [
              {
                range: { 'http.response.status_code': { gte: 400, lte: 499 } },
              },
              {
                range: { 'http.response.status_code': { gte: 500, lte: 599 } },
              },
              { match: { 'log.level': 'ERROR' } },
              { match: { 'log.level': 'WARN' } },
            ],
            filter: [
              {
                range: {
                  '@timestamp': {
                    gte: 'now-24h',
                    lte: 'now',
                  },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        highlight: {
          fields: {
            message: {},
            'error.message': {},
          },
        },
        sort: [
          { 'http.response.status_code': { order: 'desc' } },
          { '@timestamp': { order: 'desc' } },
        ],
        size: 50,
        _source: [
          '@timestamp',
          'message',
          'log.level',
          'http.response.status_code',
          'http.request.method',
          'url.path',
          'url.query',
          'http.response.duration',
          'error.message',
          'error.stack_trace',
          'user.id',
          'trace.id',
        ],
      })

      const data = response.hits as Hits

      const responseToRabbit: ResponseToRabbitAPI[] = data.hits.map((hit) => ({
        _index: this.normalizeIndex(hit._index),
        '@timestamp': hit._source['@timestamp'],
        message: hit._source.message ? hit._source.message : 'N/A',
        http_method: hit._source.http.request.method,
        http_status: hit._source.http.response.status_code,
      }))

      return responseToRabbit
    } catch (error) {
      throw new Error('Error getting logs from Elasticsearch: ' + error)
    }
  }
}
