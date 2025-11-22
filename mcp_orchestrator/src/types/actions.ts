export enum ActionType {
    JENKINS_RESTART = 'jenkins_restart',
    JENKINS_ROLLBACK = 'jenkins_rollback',
    JENKINS_STOP = 'jenkins_stop'
}

export enum ActionStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REJECTED = 'rejected'
}
