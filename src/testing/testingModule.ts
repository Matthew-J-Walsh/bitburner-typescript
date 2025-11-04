import { NS } from '@ns';
import {
    TrackProperty,
    BackgroundTask,
    PriorityTask,
} from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';

export class TestingModule extends BaseModule {
    @TrackProperty
    randomIncrement: number = 0;
    @TrackProperty
    sharedCounter: number = 0;
    @TrackProperty
    lastPriorityRun: number = 0;
    @TrackProperty
    nextPriorityRun: number = 0;

    @PriorityTask
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

export class TestingModuleTwo extends BaseModule {
    @TrackProperty
    sharedCounter: number = 0;
    @TrackProperty
    lastPriorityRun: number = 0;
    @TrackProperty
    nextPriorityRun: number = 0;

    @PriorityTask
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

/** ### TestingModule Uniqueness */
export const testingModule = new TestingModule();
state.push(testingModule);
/** ### TestingModuleTwo Uniqueness */
export const testingModuleTwo = new TestingModuleTwo();
state.push(testingModule);
