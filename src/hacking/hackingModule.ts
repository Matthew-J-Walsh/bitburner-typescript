import { NS, Server, RunOptions, ScriptArg, RunningScript } from '@ns';
import { BaseModule } from '/lib/baseModule';
import {
    HackingPolicy,
    HackingEvaluator,
    HackingUtilityModule,
} from '/hacking/hackingUtilityModule';
import { Heap } from '/lib/heap';
import { SortedArray } from '/lib/sortedArray';
import { LinkedList } from 'lib/linkedList';
import { KeyedMinHeap } from '/lib/keyedHeap';
import {
    //Todo: Fix order
    Time,
    ProcessID,
    Threads,
    maxPeriodForHackingSchedulingFunctions,
    backupSecurityFailureSchedulingDelay,
    HackScriptType,
    HackScriptRuntimes,
    hackScriptTypes,
    ScriptType,
    HackingScript,
    scriptMapping,
    LoopedScriptType,
} from '/hacking/constants';
import { approximatelyEqual } from '/lib/misc';
import { ServerUtilityModule } from './serverUtilityModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/** Holds the information about an actively running script */
type ActiveScript = {
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
type Deadzone = {
    /** When the deadzone will start */
    start: Time;
    /** When the deadzone will end */
    end: Time;
};

/** Element of a hacking batch */
type HackingElement = {
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
class HackingBatch {
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

/** Default class for ram task managers (hacking batch creators or fillers) */
class RamTaskManager {
    /**
     * Default primary manage function
     * @returns Time to be yielded to next
     */
    public manage(): Time {
        return Date.now() + maxPeriodForHackingSchedulingFunctions;
    }

    /**
     * Default checking server method, checks how many threads are running on the server
     * @param server Server to check
     * @returns Number of threads
     */
    public checkServer(server: Server): Threads {
        return 0;
    }

    /**
     * Default freeing server method, frees all instances on a server
     * @param server Server to free
     * @returns number of threads freed
     */
    public freeServer(server: Server): Threads {
        return 0;
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {}

    public log(): Record<string, any> {
        return {};
    }
}

/** Task that fills some of the Ram up with a spammable script */
class FillerRamTask extends RamTaskManager {
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

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
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
            const success = this.kill(
                this.managedScripts.get(server.hostname)!.pid,
            );
            this.managedScripts.delete(server.hostname);
            this.managedRam -= ascript.ramUsage;
            return ascript.threads;
        } else {
            return 0;
        }
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
class WeakenRamTask extends FillerRamTask {
    constructor(
        protected ns: NS,
        /** Method to fill with */
        protected fill: (threads: Threads) => ActiveScript[],
        /** Method to kill with */
        protected kill: (pid: ProcessID) => void,
        /** Targeted amount of ram to consume */
        protected targetRamGetter: () => number,
    ) {
        super(ns, scriptMapping['weaken'], fill, kill, targetRamGetter);
    }

    /**
     * Weakens may not be canceled outside of a killAll()
     */
    public freeServer(server: Server): Threads {
        return 0;
    }

    /**
     * Kills script managed, call when target changes or server is fully weakened.
     */
    public killAll(): void {
        this.managedScripts.forEach((ascript) => {
            this.kill(ascript.pid);
        });
        this.managedScripts = new Map<string, ActiveScript>();
        this.managedRam = 0;
    }
}

/** Task that handles creating new hacking batches */
class HackingRamTask extends RamTaskManager {
    /** Weaken subtask */
    private weakenRamTask?: WeakenRamTask;
    /** Next manage time */
    private nextManageTime: Time = 0;
    /** When the next batch should be execed off */
    private nextBatchInitializationTime: Time = 0;
    /** Queues for each script type */
    private scriptQueues: {
        hack: LinkedList<HackingElement>;
        grow: LinkedList<HackingElement>;
        weaken: LinkedList<HackingElement>;
    } = {
        hack: new LinkedList<HackingElement>(),
        grow: new LinkedList<HackingElement>(),
        weaken: new LinkedList<HackingElement>(),
    };
    /** List of deadzones when the target of this hacker may not be at minimum security */
    private deadZones: LinkedList<Deadzone> = new LinkedList<Deadzone>();

    constructor(
        protected ns: NS,
        /** Function to exec with */
        protected exec: (
            target: string,
            script: HackScriptType,
            threads: Threads,
            delay: Time,
            endTime: Time,
        ) => ProcessID,
        /** Method to fill with */
        protected fill: (target: string, threads: Threads) => ActiveScript[],
        /** Function to kill with */
        protected kill: (pid: ProcessID) => void,
        /** Function to exec when we needed to cancel a batch */
        protected missRecorder: (reason: string) => void,
        /** Task type metadata */
        protected evaluator: HackingEvaluator,
    ) {
        super();
        this.weakenRamTask = new WeakenRamTask(
            ns,
            (threads: Threads) => fill(evaluator.target.hostname, threads),
            kill,
            () =>
                Math.min(
                    evaluator.ramAllocation,
                    this.ns.getScriptRam(scriptMapping['weakenLooped']) * 2000,
                ), //TODO: We need to figure out how to safely recover from a stage loss
        );
    }

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    public manage(): Time {
        const currentTime: Time = Date.now();
        let policy: HackingPolicy | undefined;
        switch (this.evaluator.stage) {
            case -1:
                return currentTime + maxPeriodForHackingSchedulingFunctions;
            case 0:
                policy = this.evaluator.getPolicy()!;
                if (!policy) {
                    this.ns.tprint(`WTF no policy?`);
                    return currentTime + maxPeriodForHackingSchedulingFunctions;
                }
                if (policy.sequence.length === 0) {
                    // We are still weakening
                    this.reset();
                    return this.weakenRamTask!.manage();
                } else {
                    this.weakenRamTask!.killAll();
                    // No break as we are already stage 1 or 2
                }
            default:
                if (currentTime <= this.nextManageTime) {
                    return this.nextManageTime;
                }

                while ((this.deadZones.peek()?.end ?? Infinity) < currentTime) {
                    this.deadZones.pop()!;
                }

                policy = policy ?? this.evaluator.getPolicy()!;

                this.nextManageTime = Math.floor(currentTime + policy.spacing);

                if (
                    this.nextManageTime >
                    (this.deadZones.peek()?.start ?? Infinity)
                ) {
                    this.nextManageTime = this.deadZones.peek()!.end;
                }

                //if (
                //    this.deadZones.peek()?.start ??
                //    Infinity - 100 < currentTime // TODO: kinda have to guess for the moment?
                //) {
                //    this.ns.tprint(
                //        `Delayed??? ${currentTime}, ${this.nextManageTime}, ${this.deadZones.peek()!.start} -> ${this.deadZones.peek()!.end}`,
                //    );
                //    this.nextManageTime = this.deadZones.peek()!.end;
                //    return this.nextManageTime;
                //}

                if (
                    this.ns.getServerSecurityLevel(
                        this.evaluator.target.hostname,
                    ) !=
                    this.ns.getServerMinSecurityLevel(
                        this.evaluator.target.hostname,
                    )
                ) {
                    this.ns.tprint(
                        `Wrong deadzones ${currentTime}, ${this.deadZones.peek()?.start}\n ${this.ns.getServerSecurityLevel(
                            this.evaluator.target.hostname,
                        )}`,
                    );
                    return currentTime + backupSecurityFailureSchedulingDelay;
                }

                const scriptTimes = {
                    hack: Math.ceil(
                        this.ns.getHackTime(this.evaluator.target.hostname),
                    ),
                    grow: Math.ceil(
                        this.ns.getGrowTime(this.evaluator.target.hostname),
                    ),
                    weaken: Math.ceil(
                        this.ns.getWeakenTime(this.evaluator.target.hostname),
                    ),
                };
                /** This internal delay is due to level gain issues */
                const batchInternalDelay = Math.ceil(
                    Math.max(scriptTimes.weaken * 0.005, 200),
                );
                const endTimes = {
                    hack: currentTime + scriptTimes.hack,
                    grow: currentTime + scriptTimes.grow,
                    weaken: currentTime + scriptTimes.weaken,
                };
                const nextManageEndTimes = {
                    hack: this.nextManageTime + scriptTimes.hack,
                    grow: this.nextManageTime + scriptTimes.grow,
                    weaken: this.nextManageTime + scriptTimes.weaken,
                };

                if (policy.spacing < 1)
                    throw new Error('Impending infinite loop');

                let i = 0;
                while (
                    this.nextManageTime >= this.nextBatchInitializationTime
                ) {
                    if (!Number.isFinite(policy.spacing)) {
                        this.ns.tprint(
                            `infinite spacing ??? ${JSON.stringify(policy)}`,
                        );
                        break;
                    }
                    this.nextBatchInitializationTime = Math.max(
                        this.nextBatchInitializationTime,
                        currentTime,
                    );
                    this.startBatch(
                        this.nextBatchInitializationTime,
                        scriptTimes,
                        policy.sequence,
                        batchInternalDelay,
                    );
                    this.nextBatchInitializationTime = Math.ceil(
                        this.nextBatchInitializationTime + policy.spacing,
                    );
                    i += 1;
                    if (i > 10) {
                        this.ns.tprint(
                            `STOPPING INFINITE LOOP ${policy.spacing}`,
                        );
                        break;
                    }
                }

                this.ns.tprint(
                    `${currentTime} => ${this.nextManageTime}... ${this.nextBatchInitializationTime}`, //\n${JSON.stringify(policy)}
                );

                hackScriptTypes.forEach((script: HackScriptType) => {
                    if (this.scriptQueues[script].peek()) {
                        this.ns.tprint(
                            `Next ${script} @ ${this.scriptQueues[script].peek()?.endTime}... ${nextManageEndTimes[script]}`,
                        );
                    }
                    while (
                        /**
                         * If it should have ended by the time it would end if we started it the next manage time,
                         * we should trigger it now
                         */
                        (this.scriptQueues[script].peek()?.endTime ??
                            Infinity) <= nextManageEndTimes[script]
                    ) {
                        const elem = this.scriptQueues[script].pop()!;
                        if (
                            /**
                             * If the expected end time of the script is after the nessisary end time + the delay
                             * We kill the batch
                             */
                            endTimes[script] + batchInternalDelay / 2 >=
                            elem.endTime
                        ) {
                            elem.kill();
                            this.missRecorder(
                                `Overtime by ${endTimes[script] + batchInternalDelay / 2 - elem.endTime}ms`,
                            );
                            continue;
                        } else if (elem.endTime - endTimes[script] <= 0) {
                            throw new Error('BRUZZAH');
                        } else {
                            /**
                             * We fire it with first argument being the delay,
                             * which is calculated as the targeted end time - the time it would end if started now,
                             * and the second argument being the intended end time
                             */
                            const pid = elem.exec(
                                elem.endTime - endTimes[script],
                                elem.endTime,
                            );
                            if (pid <= 0) {
                                elem.kill();
                                this.missRecorder(
                                    `${currentTime} Exec missed ${pid}`,
                                );
                            } else {
                                this.ns.tprint(
                                    `${currentTime} Starting ${script} with delay ${elem.endTime - endTimes[script]} for end time ${elem.endTime}`,
                                );
                            }
                        }
                    }
                });

                return this.nextManageTime;
        }
    }

    /**
     * Cancel everything we can as we are switching targets,
     * Only use if switching targets
     */
    private reset() {
        hackScriptTypes.map((script: HackScriptType) => {
            while (this.scriptQueues[script].peek()) {
                this.scriptQueues[script].pop()!.kill();
            }
        });
    }

    /**
     * Starts a batch
     * @param startTime Time to start the batch
     * @param scriptTimes Up to date times for hack grow and weaken
     * @param sequencing Batch sequencing to use
     */
    private startBatch(
        startTime: Time,
        scriptTimes: { hack: Time; grow: Time; weaken: Time },
        sequencing: HackingScript[],
        batchInternalDelay: Time,
    ) {
        const batch = new HackingBatch(
            (
                script: HackScriptType,
                threads: Threads,
                delay: Time,
                endTime: Time,
            ) =>
                this.exec(
                    this.evaluator.target.hostname,
                    script,
                    threads,
                    delay,
                    endTime,
                ),
            this.kill,
        );
        const elements = batch.init(
            startTime,
            scriptTimes,
            sequencing,
            batchInternalDelay,
        );
        elements.forEach(([script, element]) => {
            this.ns.tprint(`$${script}: ${JSON.stringify(element)}`);
            this.scriptQueues[script].push(element);
        });
        if (elements.length !== 0) {
            this.deadZones.push({
                start: Math.floor(
                    startTime + scriptTimes.weaken - 1 - batchInternalDelay,
                ), // Earliest it should end
                end: Math.ceil(
                    startTime +
                        scriptTimes.weaken +
                        elements.length * batchInternalDelay,
                ), // Latest it should end
            });
            this.ns.tprint(
                `Pushed deadzone ${Math.floor(
                    startTime + scriptTimes.weaken - 1 - batchInternalDelay,
                )} -> ${Math.ceil(
                    startTime +
                        scriptTimes.weaken +
                        elements.length * batchInternalDelay,
                )}`,
            );
        }
    }

    public integrityCheck(): void {
        this.weakenRamTask!.integrityCheck();
        switch (this.evaluator.stage) {
            case -1:
            case 0:
                hackScriptTypes.forEach((script: HackScriptType) => {
                    if (!this.scriptQueues[script].isEmpty) {
                        throw new Error(
                            'Hacking Ram Task Integrity Error - Queued Scripts while Weakening',
                        );
                    }
                });
            case 1:
                if (!this.weakenRamTask!.isEmpty) {
                    throw new Error(
                        'Hacking Ram Task Integrity Error - Weakens while not Weakening',
                    );
                }

                if (
                    this.nextManageTime < Date.now() - 10_000 ||
                    this.nextBatchInitializationTime < Date.now() - 10_000
                ) {
                    this.ns.tprint(
                        'Hacking Ram Task Integrity Warning - Overtime',
                    );
                }
                const hackArr = this.scriptQueues.weaken.toArray();
                const growArr = this.scriptQueues.weaken.toArray();
                const weakenArr = this.scriptQueues.weaken.toArray();
                if (weakenArr.length > 2) {
                    this.ns.tprint(
                        'Hacking Ram Task Integrity Warning - Over Weaken',
                    );
                }
                if (
                    !hackArr.every(
                        (elem, idx) =>
                            idx === 0 ||
                            hackArr[idx - 1].endTime <= elem.endTime,
                    )
                ) {
                    throw new Error(
                        'Hacking Ram Task Integrity Error - Hack out of order',
                    );
                }
                if (
                    !growArr.every(
                        (elem, idx) =>
                            idx === 0 ||
                            growArr[idx - 1].endTime <= elem.endTime,
                    )
                ) {
                    throw new Error(
                        'Hacking Ram Task Integrity Error - Grow out of order',
                    );
                }
                if (
                    !weakenArr.every(
                        (elem, idx) =>
                            idx === 0 ||
                            weakenArr[idx - 1].endTime <= elem.endTime,
                    )
                ) {
                    throw new Error(
                        'Hacking Ram Task Integrity Error - Weaken out of order',
                    );
                }
        }
    }

    public log(): Record<string, any> {
        return {
            ...{ subWeaken: this.weakenRamTask!.log() },
            ...{
                nextManageTime: this.nextManageTime,
                nextBatchInitializationTime: this.nextBatchInitializationTime,
                nextHackEndTime: this.scriptQueues.hack.peek()?.endTime ?? 0,
                hackQueueLength: this.scriptQueues.hack.length,
                nextGrowEndTime: this.scriptQueues.grow.peek()?.endTime ?? 0,
                growQueueLength: this.scriptQueues.grow.length,
                nextWeakenEndTime:
                    this.scriptQueues.weaken.peek()?.endTime ?? 0,
                weakenQueueLength: this.scriptQueues.weaken.length,
            },
        };
    }
}

/** Holds the information needed to determine how much ram a server has in use by priority tasks */
type RamSpace = {
    /** Server hostname */
    hostname: string;
    /** Amount of ram that isn't consumed by a priority task */
    availableRam: number;
    /** Total amount of ram on server */
    totalRam: number;
};

/** Only submodule of hacking module, handles ram management, provides wrappers to simplify ram management for everything else */
class RamUsageSubmodule extends BaseModule {
    /** Datastructure storing how much of each sever's ram is used by priority tasks */
    protected priorityRamSpaceUsed: SortedArray<string, RamSpace> =
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

    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
    ) {
        super(ns);
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    /**
     * Updates all the server changes
     */
    update(): void {
        const thisScript = this.ns.getRunningScript()!;
        this.serverUtilityModule.ourServers.forEach((server) => {
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
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        const currentTime = Date.now();
        const thisScript = this.ns.getRunningScript()!;
        const liveScripts = this.trackedScriptHeap.toArray();
        if (
            !liveScripts.every(
                (ascript) =>
                    ascript.endTime < currentTime ||
                    this.ns.getRunningScript(ascript.pid) != null,
            )
        ) {
            throw new Error(
                "Ram Usage Submodule Integrity Error - Script Shouldn't be Dead",
            );
        }

        liveScripts.forEach((ascript) => {
            const rscript = this.ns.getRunningScript(ascript.pid);
            if (
                !(
                    rscript === null ||
                    rscript.ramUsage * rscript.threads == ascript.ramUsage
                )
            ) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - Script Has Wrong Ram Usage ${JSON.stringify(ascript)}\n Correct ram: ${rscript.ramUsage * rscript.threads}`,
                );
            }
        });
        liveScripts.forEach((ascript) => {
            const rscript = this.ns.getRunningScript(ascript.pid);
            if (!(rscript === null || rscript.server == ascript.hostname)) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - Script Has Wrong Server ${JSON.stringify(ascript)}\n Correct server: ${rscript.server}`,
                );
            }
        });

        this.priorityRamSpaceUsed.toArray().forEach((ramSpace) => {
            const maxRam = this.ns.getServerMaxRam(ramSpace.hostname);
            const usedRam = this.ns.getServerUsedRam(ramSpace.hostname);
            if (maxRam < ramSpace.totalRam) {
                throw new Error(
                    'Ram Usage Submodule Integrity Error - Too Much Ram Allowed',
                );
            }
            const expectedRamUsage = liveScripts
                .filter((ascript) => ascript.hostname == ramSpace.hostname)
                .reduce((acc, ascript) => acc + ascript.ramUsage, 0);
            if (
                !approximatelyEqual(
                    expectedRamUsage,
                    ramSpace.totalRam - ramSpace.availableRam,
                )
            ) {
                throw new Error(
                    `Ram Usage Submodule Integrity Error - RAM Usage Differential: ${expectedRamUsage},  ${ramSpace.totalRam - ramSpace.availableRam}`,
                );
            }
        });

        liveScripts.forEach((ascript) => {
            if (
                ascript.endTime < currentTime - 100 &&
                this.ns.getRunningScript(ascript.pid) != null
            ) {
                this.ns.tprint(
                    `Ram Usage Submodule Integrity Warning - Script alive too long by ${currentTime - 100 - ascript.endTime}ms`,
                );
            }
        });
    }

    public log(): Record<string, any> {
        return {
            trackedOnGoingScripts: this.trackedScriptHeap.size,
            trackedServerNumber: this.priorityRamSpaceUsed.size,
        };
    }
}

/**
 * ### HackingSchedulerModule Uniqueness
 * This module implements the hacking strategy
 */
export class HackingSchedulerModule extends RamUsageSubmodule {
    /** Subtasks that handle their own scheduling */
    taskList: Array<RamTaskManager> = [];

    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
        protected hackingUtilityModule: HackingUtilityModule,
    ) {
        super(ns, serverUtilityModule);

        this.taskList = [
            new HackingRamTask(
                ns,
                (
                    target: string,
                    script: HackScriptType,
                    threads: Threads,
                    delay: Time,
                    endTime: Time,
                ) => this.fire(target, script, threads, delay, endTime),
                (target: string, threads: Threads) =>
                    this.fill('weakenLooped', threads, 0, target),
                this.kill.bind(this),
                (reason: string) =>
                    this.ns.tprint(
                        `Miss on Money Making for reason: ${reason}`,
                    ),
                hackingUtilityModule.moneyEvaluation,
            ),
            new HackingRamTask(
                ns,
                (
                    target: string,
                    script: HackScriptType,
                    threads: Threads,
                    delay: Time,
                    endTime: Time,
                ) => this.fire(target, script, threads, delay, endTime),
                (target: string, threads: Threads) =>
                    this.fill('weakenLooped', threads, 1, target),
                this.kill.bind(this),
                (reason: string) =>
                    this.ns.tprint(`Miss on Exp Gen for reason: ${reason}`),
                hackingUtilityModule.expEvaluation,
            ),
            new FillerRamTask(
                ns,
                scriptMapping.share,
                (threads: Threads) => this.fill('share', threads, 2),
                this.kill.bind(this),
                () => hackingUtilityModule.shareRam,
            ),
        ];
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return super.registerBackgroundTasks().concat([
            {
                name: 'RamUsageSubmodule.update',
                fn: this.update.bind(this),
                nextRun: 0,
                interval: 60_000,
            },
        ]);
    }

    public registerPriorityTasks(): PriorityTask[] {
        return super.registerPriorityTasks().concat([
            {
                name: 'HackingSchedulerModule.manageActiveScripts',
                fn: this.manageActiveScripts.bind(this),
                nextRun: 0,
            },
        ]);
    }

    public update(): void {
        super.update();
    }

    /**
     * Fires off a priority script with a particular amount of threads
     * @param target Target server of the script
     * @param script Script to run
     * @param threads Number of threads to spawn
     * @param delay Internal to impose on fired script
     * @param endTime Earliest end time for fired script
     * @param args any additional args
     * @returns pid
     */
    private fire(
        target: string,
        script: HackScriptType,
        threads: Threads,
        delay: Time,
        endTime: Time,
        ...args: ScriptArg[]
    ): number {
        const neededRam = this.ns.getScriptRam(scriptMapping[script]) * threads;
        const server = this.requestSingleRam(neededRam);
        if (server) {
            //this.ns.tprint(
            //    `Starting script ${scriptMapping[script]} on ${server.hostname} @${target} with ${threads} threads. With an interal delay of ${delay}, expected to end in ${endTime - Date.now()}ms. This will take ${neededRam} RAM`,
            //);
            const pid = this.ns.exec(
                scriptMapping[script],
                server.hostname,
                threads,
                target,
                delay,
                endTime,
                ...args,
            );
            //this.ns.tprint(`Pid of new script: ${pid}`);
            if (pid === 0) {
                this.ns.tprint(
                    `Fire failed: 
                        ${scriptMapping[script]},
                        ${server.hostname},
                        ${threads},
                        ${target}
                    `,
                );
                return 0;
            }
            this.pushActiveScipt({
                hostname: server.hostname,
                threads: threads,
                ramUsage: neededRam,
                endTime: endTime,
                pid: pid,
            });

            return pid;
        } else {
            //throw new Error('Fuckass');
            return 0;
        }
    }

    /**
     * Fills a specified amount of ram with
     * @param script script to run
     * @param neededThreads total number of threads needed
     * @param priority priority number of the fill
     * @param args any additional args
     */
    private fill(
        script: ScriptType,
        neededThreads: Threads,
        priority: number,
        ...args: ScriptArg[]
    ): ActiveScript[] {
        const filename = scriptMapping[script];
        const ramPerThread = this.ns.getScriptRam(filename);
        const newPids: Array<ActiveScript> = [];

        for (let hostname of this.serverUtilityModule.ourHostnames) {
            if (neededThreads === 0) {
                break;
            }
            const server = this.serverUtilityModule.ourServers.get(hostname)!;

            for (let i = priority + 1; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }

            if (
                server.maxRam - this.ns.getServerUsedRam(hostname) >
                ramPerThread
            ) {
                neededThreads += this.taskList[priority].freeServer(server);

                const threads = Math.min(
                    Math.floor(
                        (server.maxRam - this.ns.getServerUsedRam(hostname)) /
                            ramPerThread,
                    ),
                    neededThreads,
                );

                if (threads !== 0) {
                    //this.ns.tprint(`${filename}, ${hostname}, ${threads}, ${args}`);
                    const pid = this.ns.exec(
                        filename,
                        hostname,
                        threads,
                        ...args,
                    );
                    if (pid === 0) {
                        this.ns.tprint(
                            `Fill failed: ${
                                filename
                            }, ${hostname}, ${threads}, ${args}
                    `,
                        );
                    }
                    const ascript = {
                        hostname: hostname,
                        threads: threads,
                        ramUsage: threads * ramPerThread,
                        endTime: Infinity,
                        pid: pid,
                    };
                    newPids.push(ascript);

                    // We need to push this as an active script as we cannot cancel it if this is a hacking script
                    if (priority < 2) this.pushActiveScipt(ascript);
                }

                neededThreads -= threads;
            }
        }
        return newPids;
    }

    /**
     * Finds or creates a server with the nessisary block of ram
     * @param neededRam Amount of ram requested
     * @param priority Always high priority
     */
    private requestSingleRam(
        neededRam: number,
        coreEffected?: boolean,
    ): Server | null {
        const result = this.priorityRamSpaceUsed.findNext(neededRam);
        if (result) {
            const server = this.serverUtilityModule.ourServers.get(
                result.hostname,
            )!;
            for (let i = 2; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }
            return server;
        }
        //throw new Error('Fuckass');
        return null;
    }

    /** Primary loop, triggers everything */
    manageActiveScripts(): Time {
        super.manageActiveScripts();
        return Math.min(...this.taskList.map((task) => task.manage()));
    }

    //@BackgroundTask(30_000)
    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        this.taskList.forEach((task) => task.integrityCheck());
        super.integrityCheck();
    }

    public log(): Record<string, any> {
        return {
            ...super.log(),
            ...this.taskList.reduce((acc, task, idx) => {
                return { ...acc, ...{ [idx]: task.log() } };
            }, {}),
        };
    }
}
