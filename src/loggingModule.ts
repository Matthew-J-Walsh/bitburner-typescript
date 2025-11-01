import { NS } from '@ns';
import {
    BackgroundTask,
    PriorityTask,
    RegisteredModule,
} from 'schedulingDecorators';
import { BaseModule } from 'baseModule';
import { logStateJSONL, getNextLogFile } from 'state';

@RegisteredModule
export class LoggingModule extends BaseModule {
    timestamp: number = 0;
    filename: string = '/logs/BN-?.?/?.jsonl';

    constructor(protected ns: NS) {
        super(ns);
        this.filename = getNextLogFile(this.ns);
        this.ns.tprint(`Logging to file: ${this.filename}`);
    }

    @BackgroundTask(10_000)
    logToFile() {
        this.timestamp = Date.now();
        logStateJSONL(this.ns, this.filename);
    }
}
