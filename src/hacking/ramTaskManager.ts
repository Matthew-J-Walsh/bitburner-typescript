import { Server, NS } from '@ns';
import {
    Time,
    maxPeriodForHackingSchedulingFunctions,
    Threads,
    ProcessID,
    scriptMapping,
} from '/hacking/constants';
import { ActiveScript } from '/hacking/constants';

/** Default class for ram task managers (hacking batch creators or fillers) */
export class RamTaskManager {
    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    public manage(): Time {
        return Date.now() + maxPeriodForHackingSchedulingFunctions;
    }

    /**
     * Checks how many fill threads are running on the server
     * @param server Server to check
     * @returns Number of threads
     */
    public checkServer(server: Server): Threads {
        return 0;
    }

    /**
     * Frees all instances of the fill on a server
     * @param server Server to free
     * @returns number of threads freed
     */
    public freeServer(server: Server): Threads {
        return 0;
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {}

    /** Logs the state of this manager */
    public log(): Record<string, any> {
        return {};
    }
}
/** Task that fills some of the Ram up with a spammable script */
export class FillerRamTask extends RamTaskManager {
    /** Scripts started/managed by this filler */
    protected managedScripts: Map<string, ActiveScript> = new Map<
        string,
        ActiveScript
    >();
    /** How much ram is currently being managed */
    protected managedRam: number = 0;
    /** How much ram each thread uses */
    protected ramPerThread: number = 0;

    constructor(
        protected ns: NS,
        /** Script file this filler will be filling with */
        protected scriptName: string,
        /** Method to fill with */
        protected fill: (threads: Threads) => ActiveScript[],
        /** Method to kill with */
        protected kill: (pid: ProcessID) => void,
        /** Targeted amount of ram to consume */
        protected targetRamGetter: () => number,
    ) {
        super();
        this.ramPerThread = this.ns.getScriptRam(this.scriptName);
        if (this.ramPerThread === 0) {
            throw new Error(`${this.scriptName} does not exist`);
        }
    }

    public manage(): Time {
        const threads = Math.floor(
            Math.max(0, this.targetRamGetter() - this.managedRam) /
                this.ramPerThread,
        );
        this.fill(threads).forEach((ascript) => {
            this.managedScripts.set(ascript.hostname, ascript);
            this.managedRam += ascript.ramUsage;
        });
        return Date.now() + maxPeriodForHackingSchedulingFunctions;
    }

    public checkServer(server: Server): Threads {
        if (this.managedScripts.has(server.hostname)) {
            const ascript = this.managedScripts.get(server.hostname)!;
            return ascript.threads;
        } else {
            return 0;
        }
    }

    public freeServer(server: Server): Threads {
        if (this.managedScripts.has(server.hostname)) {
            const ascript = this.managedScripts.get(server.hostname)!;
            this.kill(this.managedScripts.get(server.hostname)!.pid);
            this.managedScripts.delete(server.hostname);
            this.managedRam -= ascript.ramUsage;
            return ascript.threads;
        } else {
            return 0;
        }
    }

    /**
     * Kills script managed
     */
    public killAll(): void {
        this.managedScripts.forEach((ascript) => {
            this.kill(ascript.pid);
        });
        this.managedScripts.clear();
        this.managedRam = 0;
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        this.managedScripts.forEach((ascript) => {
            if (!this.ns.getRunningScript(ascript.pid)) {
                this.ns.tprint(
                    `Filler Ram Task Integrity Pseudo-Failure - Dead Script in Management`,
                );
            }
        });
        if (
            this.managedRam !=
            Array.from(this.managedScripts.values()).reduce(
                (acc: number, ascript: ActiveScript) => acc + ascript.ramUsage,
                0,
            )
        ) {
            throw new Error(
                `Filler Ram Task Integrity Failure - Managed Ram Missmatch`,
            );
        }
        if (this.managedRam > this.targetRamGetter() * 1.1) {
            this.ns.tprint('Filler Ram Task Integrity Warning - OverRAM');
        }
    }

    get isEmpty(): boolean {
        return this.managedScripts.size === 0;
    }

    public log(): Record<string, any> {
        return {
            managedRam: this.managedRam,
            numberOfManagedScripts: this.managedScripts.size,
        };
    }
}
/** Specific filler for weakens, holds some extra values, refuses to be freed to prevent resets. */
export class WeakenRamTask extends FillerRamTask {
    constructor(
        protected ns: NS,
        /** Method to fill with */
        protected fill: (threads: Threads) => ActiveScript[],
        /** Method to kill with */
        protected kill: (pid: ProcessID) => void,
        /** Targeted amount of ram to consume */
        protected targetRamGetter: () => number,
    ) {
        super(ns, scriptMapping['weakenLooped'], fill, kill, targetRamGetter);
    }

    /**
     * Weakens may not be canceled outside of a killAll()
     */
    public freeServer(server: Server): Threads {
        return 0;
    }
}
