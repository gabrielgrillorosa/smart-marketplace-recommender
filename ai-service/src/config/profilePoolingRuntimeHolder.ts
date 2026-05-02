import type { ProfilePoolingRuntime } from '../profile/clientProfileAggregation.js'

export class ProfilePoolingRuntimeHolder {
  constructor(private runtime: ProfilePoolingRuntime) {}

  get(): ProfilePoolingRuntime {
    return this.runtime
  }

  replace(next: ProfilePoolingRuntime): void {
    this.runtime = next
  }
}
