import { ToolResponse } from "../types/types"

export interface IMCPServers {
    registerTools: () => void
    handleShowLogsJenkis: () => Promise<ToolResponse>
    handleShowLogsAPI: () => Promise<ToolResponse>
    setupServer: () => Promise<void>
}