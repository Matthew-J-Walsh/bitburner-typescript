import { Time } from '/hacking/constants';
import { Heap } from '/lib/heap';

/**
 * A call that should be done at a specific time
 */
export interface QueuedHackCall {
    /** Time to make the call (earliest) */
    time: Time;
    /** Funciton to run */
    fn: () => void;
}

/**
 * Class to extend to have a queue of scripts to run
 */
export class QueueManagementModule {
    private queue: Heap<QueuedHackCall> = new Heap<QueuedHackCall>(
        (a, b) => b.time - a.time,
    );

    /**
     * Initializes the standard queue items that loop themselves
     */
    public initialQueue(): void {}

    /**
     * Adds a call to the queue
     */
    public enqueue(call: QueuedHackCall) {
        this.queue.push(call);
    }

    /**
     * Runs items in the queue as requested
     * @returns The next time this should be called
     */
    public manageQueue(): Time {
        while ((this.queue.peek()?.time ?? Infinity) <= Date.now()) {
            this.queue.pop()!.fn();
        }

        return Math.min(
            Date.now() + 5_000,
            this.queue.peek()?.time ?? Infinity,
        );
    }
}
