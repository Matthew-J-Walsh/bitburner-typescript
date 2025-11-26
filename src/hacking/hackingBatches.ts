import { NS } from '@ns';
import { TargetableServer, targetedTimeVariance } from './targetableServer';
import {
    Threads,
    Time,
    ProcessID,
    HackScriptType,
    HackScriptRuntimes,
    HackingScript,
    ActiveScript,
} from '/hacking/constants';

function getScriptTime(ns: NS, script: HackScriptType, hostname: string): Time {
    switch (script) {
        case 'hack':
            return ns.getHackTime(hostname);
        case 'grow':
            return ns.getGrowTime(hostname);
        case 'weaken':
            return ns.getWeakenTime(hostname);
        default:
            throw new Error('getScriptTime');
    }
}

/** A batch of hack scripts */
export class HackingBatch {
    /** If the batch has been killed */
    private killed: boolean = false;

    constructor(
        protected ns: NS,
        readonly parent: TargetableServer,
        private sequence: Array<[HackScriptType, Threads, Time]>,
    ) {}

    /**
     * Execs the relevant scripts
     * @param nextTime This is the next time this may get to call, queue up what you can now
     * @returns If there is anything left to queue
     */
    public manage(nextTime: Time): boolean {
        const now = Date.now();
        this.sequence = this.sequence.filter(([script, threads, endTime]) => {
            const runTime = getScriptTime(
                this.ns,
                script,
                this.parent.server.hostname,
            );
            if (nextTime + runTime + targetedTimeVariance > endTime) {
                this.start(script, threads, now, endTime - runTime, endTime);
                return false;
            }
            return true;
        });

        return this.sequence.length !== 0;
    }

    private start(
        script: HackScriptType,
        threads: Threads,
        currentTime: Time,
        startTime: Time,
        endTime: Time,
    ) {
        if (this.killed) return;
        if (startTime < currentTime) return this.kill();
        if (!this.parent.fire(script, threads, currentTime, startTime, endTime))
            this.kill();
    }

    /** Cancels the run by killing all scripts */
    public kill() {
        this.killed = true;
    }
}
