export interface BackoffOptions {
  minMs: number;
  maxMs: number;
  factor?: number;
  jitter?: number;
}

export interface BackoffController {
  nextDelay(): number;
  wait(): Promise<number>;
  reset(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createBackoff(options: BackoffOptions): BackoffController {
  const factor = options.factor ?? 2;
  const jitter = options.jitter ?? 0.25;
  let attempt = 0;

  const computeDelay = () => {
    const exp = options.minMs * Math.pow(factor, attempt);
    const bounded = Math.min(exp, options.maxMs);
    const jitterValue = bounded * jitter * Math.random();
    return Math.round(bounded + jitterValue);
  };

  return {
    nextDelay() {
      const delay = computeDelay();
      attempt += 1;
      return delay;
    },
    async wait() {
      const delay = this.nextDelay();
      await sleep(delay);
      return delay;
    },
    reset() {
      attempt = 0;
    },
  };
}
