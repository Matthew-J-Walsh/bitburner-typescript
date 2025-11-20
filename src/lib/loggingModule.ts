import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { BackgroundTask, PriorityTask } from './scheduler';

/**
 * ### LoggingModule Uniqueness
 * This modules handles logging of tracked properties for debugging or analysis purposes
 */
export class LoggingModule extends BaseModule {
    /** Timestamp for the log entry */
    timestamp: number = 0;
    /** Logging filename */
    filename: string = '/logs/BN-?-?.txt';
    /** Modules to log */
    modules!: BaseModule[];

    public constructor(protected ns: NS) {
        super(ns);
        this.filename = '/logs/BN-1-2.txt';
        this.ns.tprint(`Logging to file: ${this.filename}`);
    }

    public init(modules: BaseModule[]) {
        this.modules = modules;
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'LoggingModule.logToFile',
                fn: this.logToFile.bind(this),
                nextRun: 0,
                interval: 10_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    /** Logs all the tracked state parameters */
    public logToFile() {
        this.timestamp = Date.now();
        this.logStateJSONL(this.filename);
    }
    /** Extracts current data and appends it to the current storage file */
    private logStateJSONL(filename: string) {
        const snapshot: Record<
            string,
            Record<string, any>
        > = Object.fromEntries(
            this.modules.map((module: BaseModule) => {
                return [module.constructor.name, module.log()];
            }),
        );

        this.ns.write(filename, JSON.stringify(snapshot) + '\n', 'a');
    }

    public log(): Record<string, any> {
        return { timestamp: Date.now() };
    }
}
