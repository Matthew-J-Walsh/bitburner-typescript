import { NetscriptPort, NS, ScriptArg, Server } from '@ns';
import {
    ProcessID,
    ActiveScript,
    Time,
    Threads,
    ScriptPortCommunication,
    scriptMapping,
    coreEffectedScripts,
} from '/hacking/constants';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import { KeyedMinHeap } from '/lib/keyedHeap';
import { SortedArray } from '/lib/sortedArray';
import { ScriptNetscriptPort } from '/ports';

/** Holds the information needed to determine how much ram a server has in use by priority tasks */
interface RamSpace {
    /** Server hostname */
    hostname: string;
    /** Amount of ram that isn't consumed by a priority task */
    availableRam: number;
    /** Total amount of ram on server */
    totalRam: number;
}

export class RamManagementModule extends ServerUtilityModule {
    /** Datastructure storing how much of each sever's ram is used by priority tasks */
    private priorityRamSpaceUsed: SortedArray<string, RamSpace> =
        new SortedArray<string, RamSpace>(
            (item: RamSpace) => item.hostname,
            (item: RamSpace) => item.availableRam,
        );
    /** Heap of all timed scripts by end time to remove them from the priority ram space */
    private trackedScriptHeap: KeyedMinHeap<ProcessID, ActiveScript> =
        new KeyedMinHeap<ProcessID, ActiveScript>(
            (item: ActiveScript) => item.pid,
            (item: ActiveScript) => item.endTime,
        );
    /** Stanek threads, set by a class inheriting this */
    protected stanekThreads = 0;
    /** Request NetscriptPort */
    private netscriptPort!: NetscriptPort;
    /** Need to refill */
    private needToRefill: boolean = true;

    constructor(protected ns: NS) {
        super(ns);
        this.netscriptPort = this.ns.getPortHandle(ScriptNetscriptPort);
    }

    public initialQueue(): void {
        super.initialQueue();
        this.enqueue({
            time: Date.now(),
            fn: this.manageActiveScripts.bind(this),
        });
    }

    /**
     * Schedule the scripts requested via netport
     */
    public scheduleRequestedScripts(): void {
        const requests: ScriptPortCommunication[] = [];
        let val = this.netscriptPort.read() as
            | ScriptPortCommunication
            | undefined;
        while (val) {
            requests.push(val);
            val = this.netscriptPort.read() as
                | ScriptPortCommunication
                | undefined;
        }
        requests.forEach((request) => {
            const pid = this.startScript(
                request.script,
                request.expectedDuration,
            );
            if (request.responsePort)
                this.ns.tryWritePort(request.responsePort, pid);
        });
    }

    /**
     * Starts an (external) script with an expected duration
     * @param script Script to run
     * @param expectedDuration How long the script is expected to run, usually 0 (instant), or Infinity (forever)
     * @returns The pid of the started process
     */
    private startScript(script: string, expectedDuration: number): ProcessID {
        const res = this.fire(script, 1, false, Date.now() + expectedDuration);
        if (!res) return 0;
        return res[0].pid;
    }

    /**
     * Fires off a new script with priority.
     * @param script
     * @param threads
     * @param fracturable
     * @param endTime
     * @param args
     * @returns
     */
    public fire(
        script: string,
        threads: Threads,
        fracturable: boolean,
        endTime: Time,
        ...args: ScriptArg[]
    ): ActiveScript[] | undefined {
        const coreEffected = coreEffectedScripts.includes(script);
        const neededRam = this.ns.getScriptRam(script) * threads;
        const newScripts: ActiveScript[] = [];
        const requestedRam = this.requestRam(
            neededRam,
            fracturable ? this.ns.getScriptRam(script) : neededRam,
            coreEffected,
        );
        for (let [server, fractures] of requestedRam) {
            if (coreEffected)
                fractures = Math.ceil(
                    fractures / (1 + (server.cpuCores - 1) / 16),
                );
            const pid = this.ns.exec(
                script,
                server.hostname,
                fractures,
                ...args,
            );
            if (pid === 0) {
                throw new Error(
                    `Fire failed after aquiring server: ${script}, ${server.hostname}, ${fractures}, ${neededRam}`,
                );
            }
            const ascript = {
                hostname: server.hostname,
                threads: fractures,
                ramUsage: neededRam,
                endTime: endTime,
                pid: pid,
            };
            this.pushActiveScipt(ascript);

            newScripts.push(ascript);
        }
        return newScripts;
    }

    public refreshTargetable(): void {
        super.refreshTargetable();
        this.needToRefill = true;
    }

    /** Makes sure all servers are filled with stanek / shares */
    public refill() {
        if (!this.needToRefill) return;
        this.needToRefill = false;

        this.fill(scriptMapping.share, Infinity);
    }

    /**
     * Fills ram with a script, stanek or shares
     * @param script
     * @param neededThreads
     * @param args
     * @returns
     */
    private fill(
        script: string,
        neededThreads: Threads,
        ...args: ScriptArg[]
    ): ActiveScript[] {
        const ramPerThread = this.ns.getScriptRam(script);
        const newScripts: Array<ActiveScript> = [];

        for (let hostname of this.ourHostnames) {
            // we should switch order to something around priority list
            if (neededThreads === 0) {
                break;
            }
            const server = this.ourServers.get(hostname)!;

            if (script === scriptMapping.stanek) {
                this.ns
                    .ps()
                    .filter(
                        (processInfo) =>
                            processInfo.filename === scriptMapping.share,
                    )
                    .forEach((processInfo) => this.ns.kill(processInfo.pid));
            }

            if (
                server.maxRam - this.ns.getServerUsedRam(hostname) <=
                ramPerThread
            ) {
                neededThreads -= this.ns
                    .ps()
                    .filter((processInfo) => processInfo.filename === script)
                    .reduce(
                        (threads, processInfo) => threads + processInfo.threads,
                        0,
                    );
                continue;
            }

            const processes = this.ns
                .ps()
                .filter((processInfo) => processInfo.filename === script);
            processes.forEach((proc) => this.ns.kill(proc.pid));
            neededThreads +=
                processes.reduce((threads, proc) => threads + proc.threads, 0) /
                ramPerThread;

            const threadOnServer = Math.min(
                Math.floor(
                    (server.maxRam - this.ns.getServerUsedRam(hostname)) /
                        ramPerThread,
                ),
                neededThreads,
            );

            if (threadOnServer === 0) continue;

            //this.ns.tprint(`${script}, ${hostname}, ${threads}, ${args}`);
            const pid = this.ns.exec(script, hostname, threadOnServer, ...args);
            if (pid === 0) {
                this.ns.tprint(
                    `Fill failed on an open server: ${script}, ${hostname}, ${threadOnServer}, ${args}, ${server.maxRam} - ${this.ns.getServerUsedRam(hostname)}`,
                );
                continue;
            }

            const ascript = {
                hostname: hostname,
                threads: threadOnServer,
                ramUsage: threadOnServer * ramPerThread,
                endTime: Infinity,
                pid: pid,
            };
            newScripts.push(ascript);

            neededThreads -= threadOnServer;
        }
        return newScripts;
    }

    /**
     * Frees up some filled ram to run a function
     * @param neededRam
     * @param fractureRam
     * @param coreEffected
     * @returns
     */
    private requestRam(
        neededRam: number,
        fractureRam: number,
        coreEffected: boolean,
    ): [Server, number][] {
        let servers: [Server, number][] = [];
        let i = 0;
        while (neededRam > 0) {
            const result = this.priorityRamSpaceUsed.findNext(fractureRam, i);
            if (result) {
                const server = this.ourServers.get(result.hostname)!;
                this.ns
                    .ps()
                    .filter(
                        (processInfo) =>
                            processInfo.filename === scriptMapping.share ||
                            processInfo.filename === scriptMapping.stanek,
                    )
                    .forEach((processInfo) => this.ns.kill(processInfo.pid));
                servers.push([
                    server,
                    Math.floor(result.availableRam / fractureRam),
                ]);
            } else {
                this.ns.tprint(
                    `Failed to find ram: ${neededRam}, ${fractureRam}`,
                );
                return [];
            }
            i += 1;
        }
        this.needToRefill = true;
        return servers;
    }

    /**
     * Helper function to start tracking a new script
     * @param ascript Script to track
     */
    protected pushActiveScipt(ascript: ActiveScript): void {
        this.trackedScriptHeap.insert(ascript);
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.availableRam -=
            ascript.ramUsage;
    }

    /**
     * Helper function to stop tracking a new script
     * @param ascript Script to remove
     */
    protected clearActiveScript(ascript: ActiveScript): void {
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.availableRam +=
            ascript.ramUsage;
    }

    /**
     * Wrapper for kill that clears the active scripts where relevant
     * @param pid script to kill
     */
    protected kill(pid: ProcessID): void {
        //this.ns.tprint(`Killing pid: ${pid}`);
        const ascript = this.trackedScriptHeap.removeByKey(pid);
        if (ascript) {
            this.clearActiveScript(ascript);
        }
        this.ns.kill(pid);
    }

    /** Clears out finished scripts from the ram tracking */
    protected manageActiveScripts() {
        const currentTime = Date.now();
        while (
            (this.trackedScriptHeap.peek()?.endTime ?? Infinity) <=
                currentTime &&
            !this.ns.isRunning(this.trackedScriptHeap.peek()!.pid)
        ) {
            this.clearActiveScript(this.trackedScriptHeap.pop()!);
        }

        this.enqueue({
            time:
                (this.trackedScriptHeap.peek()?.endTime ?? Date.now() + 500) +
                100,
            fn: this.manageActiveScripts.bind(this),
        });
    }
}
