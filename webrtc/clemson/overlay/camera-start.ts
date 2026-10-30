/** Keep automatic hand tracking recoverable after an idle timeout or failed start. */
export class CameraStartup {
  private nextAttempt = 0;
  private starting = false;
  error = '';

  constructor(private now = () => performance.now()) {}

  get pending(): boolean { return this.starting; }

  reset(): void { this.nextAttempt = 0; this.error = ''; }

  async ensure(active: boolean, start: () => Promise<void>): Promise<void> {
    if (active) { this.error = ''; return; }
    if (this.starting || this.now() < this.nextAttempt) return;
    this.starting = true;
    this.nextAttempt = this.now() + 3000;
    try {
      await start();
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.nextAttempt = this.now() + 5000;
    } finally { this.starting = false; }
  }
}
