import { NS } from '@ns';

export class LoggingUtility {
    /** Logging filename */
    filename: string = '/logs/unknown.txt';

    public constructor(
        protected ns: NS,
        logname: string,
        protected logFn: () => Record<string, any>,
    ) {
        this.filename = `/logs/${logname}.txt`;
        this.ns.tprint(`Spooling up logger to: ${this.filename}`);
    }

    /** Logs all the tracked state parameters */
    public logToFile() {
        this.logStateJSONL(this.filename);
    }
    /** Extracts current data and appends it to the current storage file */
    private logStateJSONL(filename: string) {
        this.ns.write(
            filename,
            JSON.stringify({ ...{ timestamp: Date.now() }, ...this.logFn() }) +
                '\n',
            'a',
        );
    }

    public log(): Record<string, any> {
        return { timestamp: Date.now() };
    }
}
