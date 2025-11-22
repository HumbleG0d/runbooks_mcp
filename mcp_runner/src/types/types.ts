export interface JenkinsConfig {
    baseUrl: string
    username: string
    apiToken: string
}

export interface JenkinsJob {
    name: string
    url: string
    color: string // blue, red, yellow, etc.
    lastBuild?: {
        number: number
        result: string
        timestamp: number
    }
}

