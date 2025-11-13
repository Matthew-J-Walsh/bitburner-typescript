import { NS, Server, RunOptions, ScriptArg, RunningScript } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { serverUtilityModule } from '/hacking/serverUtilityModule';
import {
    hackingUtilityModule,
    HackingPolicy,
    HackingEvaluator,
} from '/hacking/hackingUtilityModule';
import { Heap } from '/lib/heap';
import { SortedArray } from '/lib/sortedArray';
import { LinkedList } from 'lib/linkedList';
import { KeyedMinHeap } from '/lib/keyedHeap';
import {
    defaultDelay,
    batchInternalDelay,
    batchMaximumDelay,
    securityFailureWaitTime,
    HackScriptType,
    hackScriptTypes,
    ScriptType,
    HackingScript,
    scriptMapping,
    LoopedScriptType,
    deadZoneDelay,
} from '/hacking/constants';
import { approximatelyEqual } from '/lib/misc';

/** Holds the information about an actively running script */
type ActiveScript = {
    /** Hostname the script is running on */
    hostname: string;
    /** Thread count */
    threads: number;
    /** How much ram the script uses */
    ramUsage: number;
    /** The expected end time of the script */
    endTime: number;
    /** Process id of the script */
    pid: number;
};

/** Element of a hacking batch */
type HackingElement = {
    /** Targeted end time of the element */
    endTime: number;
    /** Executor function for the element */
    exec: (endTime: number) => number;
    /** Kill function for the element */
    kill: () => void;
    /** Parent of the element, used for debugging... and to make sure it doesn't get GCed */
    parent: HackingBatch;
};

/** A batch of hack scripts */
class HackingBatch {
    /** Pids for scripts under this batch that have started */
    private controledScripts: Array<number> = [];
    /** If the batch has been killed */
    public killed: boolean = false;
    constructor(
        /** Executor function for this batch */
        public exec: (
            script: HackScriptType,
            threads: number,
            endTime: number,
        ) => number,
        /** Kill function to use */
        public kill: (pid: number) => void,
    ) {}
    /** End time hard */
    public hardEndTime?: number;

    public init(
        currentTime: number,
        times: { hack: number; grow: number; weaken: number },
        sequencing: HackingScript[],
    ): Array<[HackScriptType, HackingElement]> {
        const endTime = currentTime + times.weaken - 1;
        this.hardEndTime =
            endTime +
            sequencing.length * batchInternalDelay +
            batchMaximumDelay;

        return sequencing.map((hscript, idx) => [
            hscript.script,
            {
                endTime: endTime + idx * batchInternalDelay,
                exec: (endTime: number) =>
                    this.start(hscript.script, hscript.threads, endTime),
                kill: () => this.killAll(),
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
        threads: number,
        endTime: number,
    ): number {
        if (!this.killed) {
            const pid = this.exec(script, threads, endTime);
            if (pid !== 0) {
                this.controledScripts.push(pid);
            }
            return pid;
        }
        return 0;
    }

    /** Cancels the run by killing all scripts */
    public killAll() {
        this.controledScripts.forEach((pid) => this.kill(pid));
        this.killed = true;
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        if (this.killed && this.controledScripts.length > 0) {
            throw new Error('Hacking Batch Integrity Failure - False Killed');
        }
    }
}

/** Default class for ram task managers (hacking batch creators or fillers) */
class RamTaskManager {
    /**
     * Default primary manage function
     * @returns Time to be yielded to next
     */
    public manage(): number {
        return Date.now() + defaultDelay;
    }

    /**
     * Default freeing server method, frees all instances on a server
     * @param server Server to free
     * @returns number of threads freed
     */
    public freeServer(server: Server): number {
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
        protected fill: (threads: number) => ActiveScript[],
        /** Method to kill with */
        protected kill: (pid: number) => void,
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
    public manage(): number {
        const threads = Math.floor(
            Math.max(0, this.targetRamGetter() - this.managedRam) /
                this.ramPerThread,
        );
        this.fill(threads).forEach((ascript) => {
            this.managedScripts.set(ascript.hostname, ascript);
            this.managedRam += ascript.ramUsage;
        });
        return Date.now() + defaultDelay;
    }

    /**
     * Kills the filler task on a server
     * @param server Server to kill task on
     * @returns Ram Freed
     */
    public freeServer(server: Server): number {
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
        protected fill: (threads: number) => ActiveScript[],
        /** Method to kill with */
        protected kill: (pid: number) => void,
        /** Targeted amount of ram to consume */
        protected targetRamGetter: () => number,
    ) {
        super(ns, scriptMapping['weaken'], fill, kill, targetRamGetter);
    }

    /**
     * Weakens may not be canceled outside of a killAll()
     */
    public freeServer(server: Server): number {
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

type Deadzone = {
    start: number;
    end: number;
};

/** Task that handles creating new hacking batches */
class HackingRamTask extends RamTaskManager {
    /** Weaken subtask */
    private weakenRamTask?: WeakenRamTask;
    /** Next manage time */
    private nextManageTime: number = 0;
    /** When the next batch should be execed off */
    private nextBatchInitializationTime: number = 0;
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
    /** Deadzones */
    private deadZones: LinkedList<Deadzone> = new LinkedList<Deadzone>();

    constructor(
        protected ns: NS,
        /** Function to exec with */
        protected exec: (
            target: string,
            script: HackScriptType,
            threads: number,
            endTime: number,
        ) => number,
        /** Method to fill with */
        protected fill: (target: string, threads: number) => ActiveScript[],
        /** Function to kill with */
        protected kill: (pid: number) => void,
        /** Function to exec when we needed to cancel a batch */
        protected missRecorder: (reason: string) => void,
        /** Task type metadata */
        protected evaluator: HackingEvaluator,
    ) {
        super();
        this.weakenRamTask = new WeakenRamTask(
            ns,
            (threads: number) => fill(evaluator.target.hostname, threads),
            kill,
            () => evaluator.ramAllocation,
        );
    }

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    public manage(): number {
        const currentTime = Date.now();
        let policy;
        switch (this.evaluator.stage) {
            case -1:
                return currentTime + defaultDelay;
            case 0:
                policy = this.evaluator.getPolicy()!;
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

                const hackTime = this.ns.getHackTime(
                    this.evaluator.target.hostname,
                );
                const scriptTimes = {
                    hack: hackTime,
                    grow: 3.2 * hackTime,
                    weaken: 4 * hackTime,
                };
                const endTimes = {
                    hack: currentTime + scriptTimes.hack,
                    grow: currentTime + scriptTimes.grow,
                    weaken: currentTime + scriptTimes.weaken,
                };

                while ((this.deadZones.peek()?.end ?? Infinity) < currentTime) {
                    //this.ns.tprint(
                    //    `Popping deadzone from the queue: ${this.deadZones.peek()!.end} < ${currentTime}`,
                    //);
                    this.deadZones.pop()!;
                }

                if (
                    this.deadZones.peek()?.start ??
                    Infinity - deadZoneDelay < currentTime
                ) {
                    this.nextManageTime = this.deadZones.peek()!.end;
                    return this.nextManageTime;
                }

                if (
                    this.ns.getServerSecurityLevel(
                        this.evaluator.target.hostname,
                    ) !=
                    this.ns.getServerMinSecurityLevel(
                        this.evaluator.target.hostname,
                    )
                ) {
                    //this.ns.tprint(
                    //    `Wrong deadzones ${currentTime}, ${this.deadZones.peek()?.start}\n ${this.ns.getServerSecurityLevel(
                    //        this.evaluator.target.hostname,
                    //    )}`,
                    //);
                    //this.delayStreak += 1;
                    return currentTime + securityFailureWaitTime;
                }

                if (currentTime >= this.nextBatchInitializationTime) {
                    policy = policy ?? this.evaluator.getPolicy()!;
                    this.startBatch(currentTime, scriptTimes, policy.sequence);
                    this.nextBatchInitializationTime =
                        currentTime + policy.spacing;
                }

                const minTimes = hackScriptTypes.map(
                    (script: HackScriptType) => {
                        while (
                            (this.scriptQueues[script].peek()?.endTime ??
                                Infinity) <= endTimes[script]
                        ) {
                            const elem = this.scriptQueues[script].pop()!;
                            if (
                                endTimes[script] <=
                                elem.endTime + batchMaximumDelay
                            ) {
                                if (elem.exec(endTimes[script]) === 0) {
                                    elem.kill();
                                    this.missRecorder('Exec missed');
                                } else {
                                    if (script === 'hack') {
                                        //this.ns.tprint(
                                        //    `adding deadzone: ${endTimes[script]}, ${elem.parent.hardEndTime!}`,
                                        //);
                                        this.deadZones.push({
                                            start: Math.floor(endTimes[script]),
                                            end: Math.ceil(
                                                elem.parent.hardEndTime!,
                                            ),
                                        });
                                    }
                                    //this.ns.tprint(
                                    //    `Starting a ${script} at time ${currentTime}, expected end time: ${endTimes[script]}, intended end time: ${elem.endTime}`,
                                    //);
                                }
                            } else {
                                elem.kill();
                                this.missRecorder(
                                    `Overtime by ${endTimes[script] + batchMaximumDelay - elem.endTime}ms due to a late return of ${currentTime - this.nextManageTime}ms`,
                                );
                            }
                        }
                        return (
                            (this.scriptQueues[script].peek()?.endTime ??
                                Infinity) - scriptTimes[script]
                        );
                    },
                );

                this.nextManageTime = Math.min(
                    currentTime + defaultDelay,
                    ...minTimes,
                );
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
     * @param currentTime Date.now()
     * @param scriptTimes Up to date times for hack grow and weaken
     * @param sequencing Batch sequencing to use
     */
    private startBatch(
        currentTime: number,
        scriptTimes: { hack: number; grow: number; weaken: number },
        sequencing: HackingScript[],
    ) {
        const batch = new HackingBatch(
            (script: HackScriptType, threads: number, endTime: number) =>
                this.exec(
                    this.evaluator.target.hostname,
                    script,
                    threads,
                    endTime,
                ),
            this.kill,
        );
        batch
            .init(currentTime, scriptTimes, sequencing)
            .forEach(([script, element]) =>
                this.scriptQueues[script].push(element),
            );
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
    private timedScriptHeap: KeyedMinHeap<number, ActiveScript> =
        new KeyedMinHeap<number, ActiveScript>(
            (item: ActiveScript) => item.pid,
            (item: ActiveScript) => item.endTime,
        );

    /**
     * Updates all the server changes
     */
    update(): void {
        const thisScript = this.ns.getRunningScript()!;
        serverUtilityModule.ourServers.forEach((server) => {
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
        this.timedScriptHeap.insert(ascript);
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
    protected kill(pid: number): void {
        //this.ns.tprint(`Killing pid: ${pid}`);
        const ascript = this.timedScriptHeap.removeByKey(pid);
        if (ascript) {
            this.clearActiveScript(ascript);
        }
        this.ns.kill(pid);
    }

    /** Clears out finished scripts from the ram tracking */
    protected manageActiveScripts() {
        const currentTime = Date.now();
        while (
            (this.timedScriptHeap.peek()?.endTime ?? Infinity) <= currentTime &&
            !this.ns.isRunning(this.timedScriptHeap.peek()!.pid)
        ) {
            this.clearActiveScript(this.timedScriptHeap.pop()!);
        }
    }

    /** Verifies assumptions about this are true */
    public integrityCheck(): void {
        const currentTime = Date.now();
        const thisScript = this.ns.getRunningScript()!;
        const liveScripts = this.timedScriptHeap.toArray();
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
            trackedOnGoingScripts: this.timedScriptHeap.size,
            trackedServerNumber: this.priorityRamSpaceUsed.size,
        };
    }
}

/** Primary module, handles the scheduling of all ram, mostly focused around hacking */
class HackingSchedulerModule extends RamUsageSubmodule {
    /** Subtasks that handle their own scheduling */
    taskList: Array<RamTaskManager> = [];

    public init(ns: NS) {
        super.init(ns);

        this.taskList = [
            new HackingRamTask(
                ns,
                (
                    target: string,
                    script: HackScriptType,
                    threads: number,
                    endTime: number,
                ) => this.fire(target, script, threads, endTime),
                (target: string, threads: number) =>
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
                    threads: number,
                    endTime: number,
                ) => this.fire(target, script, threads, endTime),
                (target: string, threads: number) =>
                    this.fill('weakenLooped', threads, 1, target),
                this.kill.bind(this),
                (reason: string) =>
                    this.ns.tprint(`Miss on Exp Gen for reason: ${reason}`),
                hackingUtilityModule.expEvaluation,
            ),
            new FillerRamTask(
                ns,
                scriptMapping.share,
                (threads: number) => this.fill('share', threads, 2),
                this.kill.bind(this),
                () => hackingUtilityModule.shareRam,
            ),
        ];
    }

    @BackgroundTask(60_000)
    public update(): void {
        super.update();
    }

    /**
     * Fires off a priority script with a particular amount of threads
     * @param target Target server of the script
     * @param script Script to run
     * @param threads Number of threads to spawn
     * @param args any additional args
     * @returns pid
     */
    private fire(
        target: string,
        script: HackScriptType,
        threads: number,
        endTime: number,
        ...args: ScriptArg[]
    ): number {
        const neededRam = this.ns.getScriptRam(scriptMapping[script]) * threads;
        const server = this.requestSingleRam(neededRam);
        if (server) {
            //this.ns.tprint(
            //    `Starting script ${scriptMapping[script]} on ${server.hostname} @${target} with ${threads} threads. Expected to end in ${endTime - Date.now()}ms. This will take ${neededRam} RAM`,
            //);
            const pid = this.ns.exec(
                scriptMapping[script],
                server.hostname,
                threads,
                target,
                endTime, //To make the call unique
                ...args,
            );
            //this.ns.tprint(`Pid of new script: ${pid}`);
            if (pid === 0) {
                this.ns.tprint(
                    `Fire failed: 
                        ${scriptMapping[script]},
                        ${server.hostname},
                        ${threads},
                        ${target},
                        ${endTime},
                        ${args}
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
        neededThreads: number,
        priority: number,
        ...args: ScriptArg[]
    ): ActiveScript[] {
        const filename = scriptMapping[script];
        const ramPerThread = this.ns.getScriptRam(filename);
        const newPids: Array<ActiveScript> = [];

        for (let hostname of serverUtilityModule.ourHostnames) {
            if (neededThreads === 0) {
                break;
            }
            const server = serverUtilityModule.ourServers.get(hostname)!;

            for (let i = priority + 1; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }

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
                const pid = this.ns.exec(filename, hostname, threads, ...args);
                if (pid === 0) {
                    this.ns.tprint(
                        `Fill failed: ${
                            filename
                        }, ${hostname}, ${threads}, ${args}
                    `,
                    );
                }
                newPids.push({
                    hostname: hostname,
                    threads: threads,
                    ramUsage: threads * ramPerThread,
                    endTime: Infinity,
                    pid: pid,
                });
            }

            neededThreads -= threads;
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
            const server = serverUtilityModule.ourServers.get(result.hostname)!;
            for (let i = 2; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }
            return server;
        }
        //throw new Error('Fuckass');
        return null;
    }

    /** Primary loop, triggers everything */
    @PriorityTask
    manageActiveScripts(): number {
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

/**
 * ### HackingSchedulerModule Uniqueness
 * This module implements the hacking strategy
 */
export const hackingSchedulerModule = new HackingSchedulerModule();
state.push(hackingSchedulerModule);
