import { NS } from '@ns';
import { Time } from '/hacking/constants';
import { Heap } from '/lib/heap';

/**
 * A call that should be done at a specific time
 */
export interface QueuedCall {
    /** Name for debugging */
    name: string;
    /** Time to make the call (earliest) */
    time: Time;
    /** Funciton to run */
    fn: () => void;
}

/**
 * Class to extend to have a queue of scripts to run
 */
export class QueueManagementModule {
    private queue: Heap<QueuedCall> = new Heap<QueuedCall>(
        (a, b) => a.time - b.time,
    );
    /** Kick us out to start scripts */
    protected kick: boolean = false;

    /**
     * Initializes the standard queue items that loop themselves
     */
    protected initialQueue(): void {}

    /**
     * Adds a call to the queue
     */
    public enqueue(call: QueuedCall) {
        this.queue.push(call);
    }

    /**
     * Runs items in the queue as requested
     * @returns Time until next call
     */
    public manageQueue(ns: NS): Time {
        //ns.tprint(this.queue.size);
        //ns.tprint(this.queue.peek());
        //ns.tprint((this.queue.peek()?.time ?? Infinity) - Date.now());
        let i = 0;
        this.kick = false;
        while (
            (this.queue.peek()?.time ?? Infinity) <= Date.now() &&
            !this.kick &&
            i < 100
        ) {
            //ns.tprint(`${JSON.stringify(this.queue.peek())}`);
            this.queue.pop()!.fn();
            i += 1;
        }
        if (i > 99)
            throw new Error(
                `This fucker prolly got us: ${JSON.stringify(this.queue.peek())}`,
            );

        return Math.min(
            5_000,
            (this.queue.peek()?.time ?? Infinity) - Date.now(),
        );
    }
}
