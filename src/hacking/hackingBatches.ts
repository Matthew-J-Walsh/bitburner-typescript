import {
    Threads,
    Time,
    ProcessID,
    HackScriptType,
    HackScriptRuntimes,
    HackingScript,
} from '/hacking/constants';

/** Element of a hacking batch */
export type HackingElement = {
    /** Targeted end time of the element */
    endTime: Time;
    /** Executor function for the element */
    exec: (delay: Time, endTime: Time) => ProcessID;
    /** Kill function for the element */
    kill: (soft: boolean) => void;
    /** Parent of the element, used for debugging... and to make sure it doesn't get GCed */
    parent: HackingBatch;
};

/** A batch of hack scripts */
export class HackingBatch {
    /** Pids for scripts under this batch that have started */
    private controledScripts: Array<ProcessID> = [];
    /** If the batch has been killed */
    public killed: boolean = false;
    /** Hard start time */
    public hardStartTime!: Time;
    /** Children of this batch */
    public children!: Array<[HackScriptType, HackingElement]>;

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
        startTime: Time,
        times: HackScriptRuntimes,
        sequencing: HackingScript[],
        batchInternalDelay: Time,
    ) {
        this.hardStartTime = startTime - batchInternalDelay;
        const endTime = Math.ceil(startTime + times.weaken - 1);
        this.children = sequencing.map((hscript, idx) => [
            hscript.script,
            {
                endTime: endTime + idx * batchInternalDelay,
                exec: (delay: Time, endTime: Time) =>
                    this.start(hscript.script, hscript.threads, delay, endTime),
                kill: this.killAll.bind(this),
                parent: this,
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
            this.killAll(true);
        }
        return pid;
    }

    /** Cancels the run by killing all scripts */
    public killAll(soft: boolean) {
        if (!soft) {
            if (Date.now() < this.hardStartTime!) {
                this.controledScripts.forEach((pid) => this.kill(pid));
            }
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
