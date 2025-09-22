export interface Semaphore {
	acquire(): Promise<() => void>;
}

export function createSemaphore(limit: number): Semaphore {
	if (limit < 1) {
		throw new Error("Semaphore limit must be at least 1");
	}

	let permits = limit;
	const queue: Array<() => void> = [];

	const dequeue = () => {
		if (permits <= 0) return;
		const next = queue.shift();
		if (next) {
			permits -= 1;
			next();
		}
	};

	const acquire = () =>
		new Promise<() => void>((resolve) => {
			const grant = () => {
				const release = () => {
					permits += 1;
					dequeue();
				};
				resolve(release);
			};

			if (permits > 0) {
				permits -= 1;
				resolve(() => {
					permits += 1;
					dequeue();
				});
				return;
			}

			queue.push(grant);
		});

	return { acquire };
}
