import {
    Threads,
    Time,
    ProcessID,
    HackScriptType,
    HackScriptRuntimes,
    HackingScript,
} from '/hacking/constants';

/** Holds the information about an actively running script */
export type ActiveScript = {
    /** Hostname the script is running on */
    hostname: string;
    /** Thread count */
    threads: Threads;
    /** How much ram the script uses */
    ramUsage: number;
    /** The expected end time of the script */
    endTime: Time;
    /** Process id of the script */
    pid: ProcessID;
};
/** Holds information about a deadzone (not at minimum security) for hacking a server */
export type Deadzone = {
    /** When the deadzone will start */
    start: Time;
    /** When the deadzone will end */
    end: Time;
};
/** Element of a hacking batch */
export type HackingElement = {
    /** Targeted end time of the element */
    endTime: Time;
    /** Executor function for the element */
    exec: (delay: Time, endTime: Time) => ProcessID;
    /** Kill function for the element */
    kill: () => void;
    /** Parent of the element, used for debugging... and to make sure it doesn't get GCed */
    parent: HackingBatch;
    /** If this script is first */
    first: boolean;
};
/** A batch of hack scripts */
export class HackingBatch {
    /** Pids for scripts under this batch that have started */
    private controledScripts: Array<ProcessID> = [];
    /** If the batch has been killed */
    public killed: boolean = false;
    /** Hard start time */
    public hardStartTime?: Time;
    /** End time hard */
    public hardEndTime?: Time;

    constructor(
        /** Executor function for this batch */
        public exec: (
            script: HackScriptType,
            threads: Threads,
            delay: Time,
            endTime: Time,
        ) => ProcessID,
        /** Kill function to use */
        public kill: (pid: ProcessID) => void,
    ) {}

    public init(
        startTime: Time,
        times: HackScriptRuntimes,
        sequencing: HackingScript[],
        batchInternalDelay: Time,
    ): Array<[HackScriptType, HackingElement]> {
        this.hardStartTime = startTime - batchInternalDelay;
        const endTime = Math.ceil(startTime + times.weaken - 1);
        this.hardEndTime = endTime + sequencing.length * batchInternalDelay;

        return sequencing.map((hscript, idx) => [
            hscript.script,
            {
                endTime: endTime + idx * batchInternalDelay,
                exec: (delay: Time, endTime: Time) =>
                    this.start(hscript.script, hscript.threads, delay, endTime),
                kill: () => this.killAll(),
                parent: this,
                first: idx === 0,
            },
        ]);
    }

    /**
     * Helper function to start a sub element
     * @param script Script to run
     * @param threads Threads to run
     * @param endTime Expected end time
     * @returns pid
     */
    private start(
        script: HackScriptType,
        threads: Threads,
        delay: Time,
        endTime: Time,
    ): ProcessID {
        if (this.killed) return -1;
        const pid = this.exec(script, threads, delay, endTime);
        if (pid !== 0) {
            this.controledScripts.push(pid);
        } else {
            this.killAll();
        }
        return pid;
    }

    /** Cancels the run by killing all scripts */
    public killAll() {
        if (Date.now() < this.hardStartTime!) {
            this.controledScripts.forEach((pid) => this.kill(pid));
        }
        this.killed = true;
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        //if (this.killed && this.controledScripts.length > 0) {
        //    throw new Error('Hacking Batch Integrity Failure - False Killed');
        //}
    }
}
