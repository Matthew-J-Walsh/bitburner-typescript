import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

export type Epic = Story[];

export abstract class StartupFunction {
    constructor(protected ns: NS) {}

    public abstract run(): void;
}

export class StanekStartup extends StartupFunction {
    public run(): void {
        throw new Error('Not implemented');
    }
}

export abstract class Task {
    constructor(protected ns: NS) {}

    public abstract get prereqs(): any;
    public abstract get completed(): boolean;
}

export class Story {}
