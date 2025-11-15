import { NS } from '@ns';
import { Heap } from '/lib/heap';

/**
 * Time before another priority task that background tasks are blocked in order to prevent overrun
 */
const backgroundBlockTime = 200;

/** Task that should be run with priority */
export interface PriorityTask {
    /** Name of scheduled task */
    name: string;
    /** Task to run */
    fn: () => number;
    /** Time that the next run should occur '''after''' */
    nextRun: number;
}

/** Task that should be run in the background */
export interface BackgroundTask {
    /** Name of scheduled task */
    name: string;
    /** Task to run */
    fn: () => void | number;
    /** Time that the next run should occur '''after''' */
    nextRun: number;
    /** Interval to repeat the task */
    interval: number;
}

/**
 * Scheduler object. Should only have one instance. Runs the scheduled actions as appropriate
 */
export class Scheduler {
    /** Heap for the priority tasks */
    priorityQueue: Heap<PriorityTask>;
    /** Heap for the background tasks */
    backgroundQueue: Heap<BackgroundTask>;

    constructor(
        protected ns: NS,
        protected priorityTasks: PriorityTask[],
        protected backgroundTasks: BackgroundTask[],
    ) {
        this.priorityQueue = new Heap<PriorityTask>(
            (a, b) => a.nextRun - b.nextRun,
        );
        this.backgroundQueue = new Heap<BackgroundTask>(
            (a, b) => a.nextRun - b.nextRun,
        );

        priorityTasks.forEach((task) => this.priorityQueue.push(task));
        backgroundTasks.forEach((task) => this.backgroundQueue.push(task));
    }

    /**
     * Runs scheduled tasks.
     * Runs all due priority tasks.
     * Runs an appropriate number of background tasks
     * @returns Requested sleep time
     */
    async fire() {
        const now = Date.now();

        while (true) {
            const task = this.priorityQueue.peek();
            if (!task || task.nextRun > now) break;

            this.priorityQueue.pop();
            task.nextRun = task.fn();
            if (task.nextRun < now) throw new Error(`Fuckass ${task.name}`);
            this.priorityQueue.push(task);
        }

        const nextPriority = this.nextPriorityTime();
        const cutoff = nextPriority - backgroundBlockTime;

        while (Date.now() < cutoff) {
            const task = this.backgroundQueue.peek();
            if (!task || task.nextRun > now) break;

            this.backgroundQueue.pop();
            task.interval = task.fn() ?? task.interval;
            task.nextRun = now + task.interval;
            if (task.nextRun < now) throw new Error(`Fuckass ${task.name}`);
            this.backgroundQueue.push(task);
        }

        return this.getNextSleepTime();
    }

    /** Time of next scheduled priority task */
    nextPriorityTime(): number {
        const next = this.priorityQueue.peek();
        return next ? next.nextRun : Date.now() + 1_000;
    }

    /** Requested sleep time */
    getNextSleepTime(): number {
        const next = this.nextPriorityTime();
        return Math.max(1, next - Date.now());
    }
}
