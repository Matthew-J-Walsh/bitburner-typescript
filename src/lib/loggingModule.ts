import { NS } from '@ns';
import {
    TrackProperty,
    BackgroundTask,
    PriorityTask,
} from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { logStateJSONL, getNextLogFile, state } from '/lib/state';

class LoggingModule extends BaseModule {
    /** Timestamp for the log entry */
    @TrackProperty
    timestamp: number = 0;
    /** Logging filename */
    filename: string = '/logs/BN-?-?/?.txt';

    init(ns: NS) {
        super.init(ns);
        this.filename = getNextLogFile(this.ns);
        this.ns.tprint(`Logging to file: ${this.filename}`);
    }

    /** Logs all the tracked state parameters */
    @BackgroundTask(10_000)
    logToFile() {
        this.timestamp = Date.now();
        logStateJSONL(this.ns, this.filename);
    }
}

/**
 * ### LoggingModule Uniqueness
 * This modules handles logging of tracked properties for debugging or analysis purposes
 */
export const loggingModule = new LoggingModule();
state.push(loggingModule);
