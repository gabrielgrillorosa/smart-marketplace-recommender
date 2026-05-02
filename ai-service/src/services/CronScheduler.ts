import * as cron from 'node-cron'
import { TrainingJobRegistry } from './TrainingJobRegistry.js'

export type CronSchedulerOptions = string | { enabled?: boolean; schedule?: string }

export class CronScheduler {
  private task: cron.ScheduledTask | null = null
  private readonly schedule: string
  private readonly cronDisabled: boolean

  constructor(
    private readonly registry: TrainingJobRegistry,
    arg: CronSchedulerOptions = '0 2 * * *'
  ) {
    if (typeof arg === 'object' && arg !== null) {
      this.cronDisabled = arg.enabled === false
      this.schedule = arg.schedule ?? '0 2 * * *'
    } else {
      this.cronDisabled = false
      this.schedule = arg
    }
  }

  start(): void {
    if (this.cronDisabled) {
      console.info('[CronScheduler] Daily training cron disabled (ENABLE_DAILY_TRAIN=false)')
      return
    }

    this.task = cron.schedule(this.schedule, () => {
      setImmediate(() => {
        try {
          this.registry.enqueue()
          console.info('[CronScheduler] Daily training job enqueued')
        } catch (err) {
          console.warn('[CronScheduler] Training already in progress — skipping scheduled run')
          console.debug('[CronScheduler] Skip reason:', err)
        }
      })
    })

    const next = this.getNextExecution()
    console.info(`[CronScheduler] Daily training cron registered: "${this.schedule}" — next run: ${next.toISOString()}`)
  }

  stop(): void {
    this.task?.stop()
    this.task = null
  }

  getNextExecution(): Date {
    // Compute next execution from cron expression
    // Parse schedule fields: min hour dom month dow
    const parts = this.schedule.split(' ')
    if (parts.length !== 5) return new Date()

    const [minStr, hourStr] = parts
    const min = minStr === '*' ? 0 : parseInt(minStr, 10)
    const hour = hourStr === '*' ? 0 : parseInt(hourStr, 10)

    const now = new Date()
    const next = new Date(now)
    next.setSeconds(0, 0)
    next.setMinutes(min)
    next.setHours(hour)

    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }

    return next
  }
}
