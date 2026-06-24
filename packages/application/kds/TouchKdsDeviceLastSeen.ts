import type { KdsRepositoryPort } from './ports/KdsRepositoryPort';

export class TouchKdsDeviceLastSeen {
  constructor(private readonly repository: KdsRepositoryPort) {}

  execute(deviceId: string): Promise<void> {
    return this.repository.touchDeviceLastSeen(deviceId);
  }
}
