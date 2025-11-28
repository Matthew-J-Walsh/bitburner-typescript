import { NetscriptPort, NS, RunOptions, ScriptArg, Server } from '@ns';
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
    /** Total server ram avaiable to us */
    protected totalServerRam!: number;

    constructor(protected ns: NS) {
        super(ns);
        this.netscriptPort = this.ns.getPortHandle(ScriptNetscriptPort);
        this.updateRamAvailability();
    }

    protected initialQueue(): void {
        super.initialQueue();
        this.enqueue({
            name: 'manageActiveScripts',
            time: Date.now(),
            fn: this.manageActiveScripts.bind(this),
        });
        this.enqueue({
            name: 'updateRamAvailability',
            time: Date.now() + 30_000,
            fn: this.updateRamAvailability.bind(this),
        });
    }

    /**
     * Updates all the server changes
     */
    updateRamAvailability() {
        const thisScript = this.ns.getRunningScript()!;
        this.ourServers.forEach((server) => {
            if (!this.priorityRamSpaceUsed.getByKey(server.hostname)) {
                if (server.hostname === thisScript.server) {
                    this.priorityRamSpaceUsed.insert({
                        hostname: server.hostname,
                        availableRam: server.maxRam - thisScript.ramUsage,
                        totalRam: server.maxRam - thisScript.ramUsage,
                    });
                } else {
                    this.priorityRamSpaceUsed.insert({
                        hostname: server.hostname,
                        availableRam: server.maxRam,
                        totalRam: server.maxRam,
                    });
                }
            } else {
                const difference =
                    server.maxRam -
                    this.priorityRamSpaceUsed.getByKey(server.hostname)!
                        .totalRam;
                if (difference != 0) {
                    this.priorityRamSpaceUsed.getByKey(
                        server.hostname,
                    )!.totalRam += difference;
                    this.priorityRamSpaceUsed.getByKey(
                        server.hostname,
                    )!.availableRam += difference;
                    this.priorityRamSpaceUsed.update(server.hostname);
                }
            }
        });
        this.totalServerRam =
            Array.from(this.ourServers.values()).reduce(
                (acc, server) => acc + server.maxRam,
                0,
            ) - this.ns.ramOverride();

        this.enqueue({
            name: 'updateRamAvailability',
            time: Date.now() + 30_000,
            fn: this.updateRamAvailability.bind(this),
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

    private exec(
        script: string,
        hostname: string,
        threadOrOptions?: number | RunOptions | undefined,
        ...args: ScriptArg[]
    ): number {
        //if (!this.ns.ls(hostname, script).includes(script))
        this.ns.scp(script, hostname);
        return this.ns.exec(script, hostname, threadOrOptions, ...args);
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
        if (threads <= 0) {
            this.ns.tprint(`${script} asking for ${threads} threads`);
            return;
        }
        const coreEffected = coreEffectedScripts.includes(script);
        const neededRam = this.ns.getScriptRam(script) * threads;
        const newScripts: ActiveScript[] = [];
        const requestedRam = this.requestRam(
            neededRam,
            fracturable ? this.ns.getScriptRam(script) : neededRam,
            coreEffected,
        );
        for (let [server, fractures] of requestedRam) {
            if (!fracturable) fractures = threads;
            if (false && coreEffected) {
                fractures = Math.ceil(
                    fractures / (1 + (server.cpuCores - 1) / 16),
                );
            }
            if (fractures === 0)
                throw new Error(
                    `0 fracture size: ${script}, ${server.hostname}, ${threads} -> ${fractures}, ${neededRam}\n${this.ns.getServerMaxRam(server.hostname) - this.ns.getServerUsedRam(server.hostname)}`,
                );
            const pid = this.exec(script, server.hostname, fractures, ...args);
            if (pid === 0) {
                throw new Error(
                    `Fire failed after aquiring server: ${script}, ${server.hostname}, ${fractures}, ${neededRam}\n${this.ns.getServerMaxRam(server.hostname) - this.ns.getServerUsedRam(server.hostname)}`,
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

            //this.ns.tprint(`${script}, ${hostname}, ${threads}, ${args}`);)
            const pid = this.exec(script, hostname, threadOnServer, ...args);
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
        while (neededRam > 1.6) {
            const result = this.priorityRamSpaceUsed.findNext(fractureRam, i);
            if (result) {
                const server = this.ourServers.get(result.hostname)!;
                this.ns
                    .ps(result.hostname)
                    .filter(
                        (processInfo) =>
                            processInfo.filename === scriptMapping.share ||
                            processInfo.filename === scriptMapping.stanek,
                    )
                    .forEach((processInfo) => this.ns.kill(processInfo.pid));
                const fractures = Math.min(
                    Math.ceil(neededRam / fractureRam),
                    Math.floor(result.availableRam / fractureRam),
                );
                //this.ns.tprint(`${server.hostname}: ${fractures}`);
                if (fractures > 0) {
                    servers.push([server, fractures]);
                    neededRam = neededRam - fractures * fractureRam;
                }
            } else {
                this.ns.tprint(
                    `Failed to find ram: ${neededRam}, ${fractureRam}`,
                );
                return [];
            }
            i += 1;
            if (i > 1000) throw new Error('Infinite loop???');
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
            name: 'manageActiveScripts',
            time:
                (this.trackedScriptHeap.peek()?.endTime ?? Date.now() + 500) +
                100,
            fn: this.manageActiveScripts.bind(this),
        });
    }
}
