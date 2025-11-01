import { NS } from '@ns';
import {
    BackgroundTask,
    PriorityTask,
    RegisteredModule,
} from 'schedulingDecorators';
import { BaseModule } from 'baseModule';

@RegisteredModule
export class TestingModule extends BaseModule {
    randomIncrement: number = 0;
    sharedCounter: number = 0;
    lastPriorityRun: number = 0;
    nextPriorityRun: number = 0;

    @PriorityTask()
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
        return delay;
    }

    @BackgroundTask(1000)
    testRandomIncrement() {
        this.randomIncrement += Math.random() * 2;
        this.sharedCounter += Math.floor(this.randomIncrement);
        this.ns.tprint(
            `Increment: ${this.randomIncrement}, Counter: ${this.sharedCounter}`,
        );
    }

    @BackgroundTask(5000)
    resetCounter() {
        if (this.sharedCounter > 1000 || this.sharedCounter < -1000) {
            this.sharedCounter = 0;
            this.ns.tprint('Counter reset due to overflow');
        }
    }
}

@RegisteredModule
export class TestingModuleTwo extends BaseModule {
    sharedCounter: number = 0;
    lastPriorityRun: number = 0;
    nextPriorityRun: number = 0;

    @PriorityTask()
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
        return delay;
    }

    @BackgroundTask(2000)
    backgroundCounter() {
        this.sharedCounter *= 2;
        this.ns.tprint(`Counter doubled to: ${this.sharedCounter}`);
    }

    @BackgroundTask(3000)
    backgroundDivider() {
        this.sharedCounter = Math.floor(this.sharedCounter / 3);
        this.ns.tprint(`Counter divided by 3 to: ${this.sharedCounter}`);
    }
}
