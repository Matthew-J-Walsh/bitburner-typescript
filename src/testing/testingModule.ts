import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/** ### TestingModule Uniqueness */
export class TestingModule extends BaseModule {
    randomIncrement: number = 0;
    sharedCounter: number = 0;
    lastPriorityRun: number = 0;
    nextPriorityRun: number = 0;

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'TestingModule.testRandomIncrement',
                fn: this.testRandomIncrement.bind(this),
                nextRun: 0,
                interval: 1_000,
            },
            {
                name: 'TestingModule.resetCounter',
                fn: this.resetCounter.bind(this),
                nextRun: 0,
                interval: 5_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [
            {
                name: 'TestingModule.priorityTask',
                fn: this.priorityTask.bind(this),
                nextRun: 0,
            },
        ];
    }

    //@PriorityTask
    priorityTask() {
        const now = Date.now();
        if (this.lastPriorityRun !== 0) {
            const difference = now - this.nextPriorityRun;
            this.ns.tprint(`Priority task yielded off by ${difference}ms`);
        }
        this.lastPriorityRun = now;
        this.sharedCounter -= 1;
        const delay = Math.random() * 800 + 200;
        this.nextPriorityRun = now + delay;
        return this.nextPriorityRun;
    }

    //@BackgroundTask(1000)
    testRandomIncrement() {
        this.randomIncrement += Math.random() * 2;
        this.sharedCounter += Math.floor(this.randomIncrement);
        this.ns.tprint(
            `Increment: ${this.randomIncrement}, Counter: ${this.sharedCounter}`,
        );
    }

    //@BackgroundTask(5000)
    resetCounter() {
        if (this.sharedCounter > 1000 || this.sharedCounter < -1000) {
            this.sharedCounter = 0;
            this.ns.tprint('Counter reset due to overflow');
        }
    }
}

/** ### TestingModuleTwo Uniqueness */
export class TestingModuleTwo extends BaseModule {
    sharedCounter: number = 0;
    lastPriorityRun: number = 0;
    nextPriorityRun: number = 0;

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'TestingModuleTwo.backgroundCounter',
                fn: this.backgroundCounter.bind(this),
                nextRun: 0,
                interval: 2_000,
            },
            {
                name: 'TestingModuleTwo.backgroundDivider',
                fn: this.backgroundDivider.bind(this),
                nextRun: 0,
                interval: 3_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [
            {
                name: 'TestingModuleTwo.priorityRandomYield',
                fn: this.priorityRandomYield.bind(this),
                nextRun: 0,
            },
        ];
    }

    //@PriorityTask
    priorityRandomYield() {
        const now = Date.now();
        if (this.lastPriorityRun !== 0) {
            const difference = now - this.nextPriorityRun;
            this.ns.tprint(`Priority task yielded off by ${difference}ms`);
        }
        this.lastPriorityRun = now;
        this.sharedCounter += 1;
        const delay = Math.random() * 1000 + 500;
        this.nextPriorityRun = now + delay;
        return this.nextPriorityRun;
    }

    //@BackgroundTask(2000)
    backgroundCounter() {
        this.sharedCounter *= 2;
        this.ns.tprint(`Counter doubled to: ${this.sharedCounter}`);
    }

    //@BackgroundTask(3000)
    backgroundDivider() {
        this.sharedCounter = Math.floor(this.sharedCounter / 3);
        this.ns.tprint(`Counter divided by 3 to: ${this.sharedCounter}`);
    }
}
