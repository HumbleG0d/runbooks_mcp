import fs from 'fs/promises'
import path from 'path'

type StoreData = Record<string, number>

export class LastSentStore {
    private filePath: string
    private data: StoreData = {}
    private loaded = false

    constructor(filePath?: string) {
        this.filePath = filePath || path.resolve(__dirname, '..', '..', 'lastSent.json')
    }

    private async load(): Promise<void> {
        if (this.loaded) return
        try {
            const txt = await fs.readFile(this.filePath, 'utf8')
            this.data = JSON.parse(txt || '{}') as StoreData
        } catch (err) {
            // If file does not exist or is invalid, start empty
            this.data = {}
        }
        this.loaded = true
    }

    public async get(key: string): Promise<number> {
        await this.load()
        return this.data[key] || 0
    }

    public async updateMax(key: string, ts: number): Promise<void> {
        await this.load()
        const prev = this.data[key] || 0
        if (ts > prev) {
            this.data[key] = ts
            await this.persist()
        }
    }

    public async persist(): Promise<void> {
        // ensure directory exists
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true })
        } catch (e) {
            // ignore
        }
        await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8')
    }
}

export const lastSentStore = new LastSentStore()
