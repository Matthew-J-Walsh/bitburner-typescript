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
} from '/hacking/constants';

/** Element of a hacking batch */
type HackingElement = {
    /** Targeted end time of the element */
    endTime: number;
    /** Executor function for the element */
    exec: (endTime: number) => number;
    /** Kill function for the element */
    kill: () => void;
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

    public init(
        currentTime: number,
        times: { hack: number; grow: number; weaken: number },
        sequencing: HackingScript[],
    ): Array<[HackScriptType, HackingElement]> {
        const endTime = currentTime + times.weaken - 1;

        return sequencing.map((hscript, idx) => [
            hscript.script,
            {
                endTime: endTime + idx * batchInternalDelay,
                exec: (endTime: number) =>
                    this.start(hscript.script, hscript.threads, endTime),
                kill: () => this.killAll(),
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
            return this.controledScripts.push(
                this.exec(script, threads, endTime),
            );
        }
        return 0;
    }

    /** Cancels the run by killing all scripts */
    public killAll() {
        this.controledScripts.forEach((pid) => this.kill(pid));
        this.killed = true;
    }
}

/** Default class for ram task managers (hacking batch creators or fillers) */
class RamTaskManager {
    /**
     * Default primary manage function
     * @returns Time to be yielded to next
     */
    manage(): number {
        return defaultDelay;
    }

    /**
     * Default freeing server method, frees all instances on a server
     * @param server Server to free
     * @returns number of threads freed
     */
    public freeServer(server: Server): number {
        return 0;
    }
}

/** Task that fills some of the Ram up with a spammable script */
class FillerRamTask extends RamTaskManager {
    managedScripts: Map<string, number> = new Map<string, number>();
    managedRam: number = 0;
    ramPerThread: number = 0;

    constructor(
        protected ns: NS,
        /** Script file this filler will be filling with */
        protected scriptName: string,
        /** Method to fill with */
        protected fill: (threads: number) => number[],
        /** Method to kill with */
        protected kill: (pid: number) => void,
        /** Targeted amount of ram to consume */
        protected targetRam: number,
    ) {
        super();
        this.ramPerThread = this.ns.getScriptRam(this.scriptName);
    }

    /** Updates the targeted ram of this filler */
    update(targetRam: number) {
        this.targetRam = targetRam;
    }

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    manage(): number {
        const threads = Math.floor(
            Math.max(0, this.targetRam - this.managedRam) / this.ramPerThread,
        );
        this.fill(threads).forEach((pid) => {
            const runningScript = this.ns.getRunningScript(pid)!; //TODO, we shouldn't need this call
            this.managedScripts.set(runningScript.server, pid);
        });
        return defaultDelay;
    }

    /**
     * Kills the filler task on a server
     * @param server Server to kill task on
     * @returns Ram Freed
     */
    freeServer(server: Server): number {
        if (this.managedScripts.has(server.hostname)) {
            const ramFreed = this.ns.getRunningScript(
                this.managedScripts.get(server.hostname),
            )!;
            const success = this.kill(
                this.managedScripts.get(server.hostname)!,
            );
            this.managedScripts.delete(server.hostname);
            return ramFreed.threads;
        } else {
            return 0;
        }
    }
}

/** Specific filler for weakens, holds some extra values, refuses to be freed to prevent resets. */
class WeakenRamTask extends FillerRamTask {
    constructor(
        protected ns: NS,
        /** Method to fill with */
        protected fill: (threads: number) => number[],
        /** Method to kill with */
        protected kill: (pid: number) => void,
        /** Targeted amount of ram to consume */
        protected targetRam: number,
        /** Server target */
        public target: Server,
    ) {
        super(ns, scriptMapping['weaken'], fill, kill, targetRam);
        this.ramPerThread = this.ns.getScriptRam(this.scriptName);
    }

    /**
     * Weakens may not be canceled outside of a killAll()
     */
    freeServer(server: Server): number {
        return 0;
    }

    /**
     * Kills script managed, call when target changes or server is fully weakened.
     */
    killAll(): void {
        this.managedScripts.forEach((pid) => {
            this.kill(pid);
        });
        this.managedScripts = new Map<string, number>();
        this.managedRam = 0;
    }
}

/** Task that handles creating new hacking batches */
class HackingRamTask extends RamTaskManager {
    /** Next manage time */
    nextManageTime: number = 0;
    /** When the next batch should be execed off */
    nextBatchInitializationTime: number = 0;
    /** Queues for each script type */
    scriptQueues: {
        hack: LinkedList<HackingElement>;
        grow: LinkedList<HackingElement>;
        weaken: LinkedList<HackingElement>;
    } = {
        hack: new LinkedList<HackingElement>(),
        grow: new LinkedList<HackingElement>(),
        weaken: new LinkedList<HackingElement>(),
    };

    constructor(
        protected ns: NS,
        /** Function to exec with */
        protected exec: (
            script: HackScriptType,
            threads: number,
            endTime: number,
        ) => number,
        /** Function to kill with */
        protected kill: (pid: number) => void,
        /** Target of hacking */
        public target: Server,
        /** Function to exec when we needed to cancel a batch */
        protected missRecorder: () => void,
        /** Function that gives us an up to date policy */
        public getPolicy: () => HackingPolicy,
        /** Funciton that checks if we are at minimum security */
        protected checkSecurityLevel: () => boolean,
        /** Task type metadata */
        public taskType: string,
    ) {
        super();
    }

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    manage(): number {
        const currentTime = Date.now();
        if (currentTime <= this.nextManageTime) {
            return this.nextManageTime;
        }

        if (!this.checkSecurityLevel()) {
            return securityFailureWaitTime;
        }

        const hackTime = this.ns.getHackTime(this.target.hostname);
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

        if (currentTime >= this.nextBatchInitializationTime) {
            const policy = this.getPolicy();
            this.startBatch(currentTime, scriptTimes, policy.sequence);
            this.nextBatchInitializationTime = currentTime + policy.spacing;
        }

        const minTimes = hackScriptTypes.map((script: HackScriptType) => {
            while (
                (this.scriptQueues[script].peek()?.endTime ?? Infinity) <=
                endTimes[script]
            ) {
                const elem = this.scriptQueues[script].pop()!;
                if (elem.endTime + batchMaximumDelay > endTimes[script]) {
                    elem.exec(endTimes[script]);
                } else {
                    elem.kill();
                    this.missRecorder();
                }
            }
            return (
                (this.scriptQueues[script].peek()?.endTime ?? Infinity) -
                scriptTimes[script]
            );
        });

        return Math.min(defaultDelay, ...minTimes);
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
        const batch = new HackingBatch(this.exec, this.kill);
        batch
            .init(currentTime, scriptTimes, sequencing)
            .forEach(([script, element]) =>
                this.scriptQueues[script].push(element),
            );
    }
}

/** Holds the information needed to determine how much ram a server has in use by priority tasks */
type RamSpace = {
    /** Server hostname */
    hostname: string;
    /** Amount of ram that isn't consumed by a priority task */
    avaiableRam: number;
    /** Total amount of ram on server */
    totalRam: number;
};

/** Holds the information about an actively running script */
type ActiveScript = {
    /** Hostname the script is running on */
    hostname: string;
    /** How much ram the script uses */
    ramUsage: number;
    /** The expected end time of the script */
    endTime: number;
    /** Process id of the script */
    pid: number;
};

/** Only submodule of hacking module, handles ram management, provides wrappers to simplify ram management for everything else */
class RamUsageSubmodule extends BaseModule {
    /** Datastructure storing how much of each sever's ram is used by priority tasks */
    priorityRamSpaceUsed: SortedArray<string, RamSpace> = new SortedArray<
        string,
        RamSpace
    >(
        (item: RamSpace) => item.hostname,
        (item: RamSpace) => item.avaiableRam,
    );
    /** Heap of all timed scripts by end time to remove them from the priority ram space */
    timedScriptHeap: KeyedMinHeap<number, ActiveScript> = new KeyedMinHeap<
        number,
        ActiveScript
    >(
        (item: ActiveScript) => item.pid,
        (item: ActiveScript) => item.endTime,
    );

    /**
     * Updates all the server changes
     */
    @BackgroundTask(60_000)
    update(): void {
        serverUtilityModule.ourServers.forEach((server) => {
            if (!this.priorityRamSpaceUsed.getByKey(server.hostname)) {
                this.priorityRamSpaceUsed.insert({
                    hostname: server.hostname,
                    avaiableRam: server.maxRam,
                    totalRam: server.maxRam,
                });
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
                    )!.avaiableRam += difference;
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
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.avaiableRam -=
            ascript.ramUsage;
    }

    /**
     * Helper function to stop tracking a new script
     * @param ascript Script to remove
     */
    protected clearActiveScript(ascript: ActiveScript): void {
        this.priorityRamSpaceUsed.getByKey(ascript.hostname)!.avaiableRam +=
            ascript.ramUsage;
    }

    /**
     * Wrapper for kill that clears the active scripts where relevant
     * @param pid script to kill
     */
    protected kill(pid: number): void {
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
}

/** Primary module, handles the scheduling of all ram, mostly focused around hacking */
class HackingSchedulerModule extends RamUsageSubmodule {
    /** Subtasks that handle their own scheduling */
    taskList: Array<RamTaskManager> = [];

    init(ns: NS) {
        super.init(ns);

        this.taskList = [
            new RamTaskManager(),
            new RamTaskManager(),
            new FillerRamTask(
                ns,
                'share',
                (threads: number) => this.fill('share', threads, 2),
                this.kill,
                0,
            ),
        ];
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
            const pid = this.ns.exec(
                scriptMapping[script],
                server.hostname,
                threads,
                target,
                ...args,
            );
            this.pushActiveScipt({
                hostname: server.hostname,
                ramUsage: neededRam,
                endTime: endTime,
                pid: pid,
            });

            return pid;
        } else {
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
    ): number[] {
        const filename = scriptMapping[script];
        const ramPerThread = this.ns.getScriptRam(filename);
        const newPids: Array<number> = [];

        for (let hostname in serverUtilityModule.ourHostnames) {
            const server = serverUtilityModule.ourServers.get(hostname)!;

            for (let i = priority + 1; i < this.taskList.length; i++) {
                this.taskList[i].freeServer(server);
            }

            neededThreads += this.taskList[priority].freeServer(server);

            const threads = Math.min(
                (server.maxRam - this.ns.getServerUsedRam(hostname)) /
                    ramPerThread,
                neededThreads,
            );

            newPids.push(this.ns.exec(filename, hostname, threads, ...args));

            neededThreads -= threads;
            if (neededThreads === 0) {
                break;
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
        return result
            ? serverUtilityModule.ourServers.get(result.hostname)!
            : null;
    }

    /**
     * Helper function to create new hack tasks
     * @param target target of the hack task
     * @param hackingEvaluator the evaluator associated with this hack task request
     * @param getRamPercent function to get the percentage of ram to use for this task
     * @param taskType metadata for the task
     * @returns the new hack task
     */
    private createHackTask(
        target: Server,
        hackingEvaluator: HackingEvaluator,
        getRamPercent: () => number,
        taskType: string,
    ): HackingRamTask {
        const checkSecurity = () =>
            this.ns.getServerSecurityLevel(target.hostname) ===
            this.ns.getServerMinSecurityLevel(target.hostname);
        return new HackingRamTask(
            this.ns,
            (script: HackScriptType, threads: number, endTime: number) =>
                this.fire(target.hostname, script, threads, endTime),
            this.kill,
            target,
            () => null,
            () =>
                hackingEvaluator.getPolicy(
                    getRamPercent() * serverUtilityModule.totalServerRam(),
                    target,
                ),
            () => checkSecurity(),
            taskType,
        );
    }

    /** Primary loop, triggers everything */
    @PriorityTask
    manageActiveScripts(): number {
        super.manageActiveScripts();
        return Math.min(...this.taskList.map((task) => task.manage()));
    }

    /** Helper task to update the money strategy implementation */
    @BackgroundTask(30_000)
    updateMoney(): void {
        const target = hackingUtilityModule.growEvaluation!.getTarget();
        const task = this.taskList[0];
        if (
            (task instanceof HackingRamTask || task instanceof WeakenRamTask) &&
            task.target === target
        ) {
            if (
                task instanceof WeakenRamTask &&
                this.ns.getServerSecurityLevel(target.hostname) ===
                    this.ns.getServerMinSecurityLevel(target.hostname)
            ) {
                task.killAll();
                this.taskList[0] = this.createHackTask(
                    target,
                    hackingUtilityModule.growEvaluation!,
                    () => hackingUtilityModule.ramProportioningTargets!.money,
                    'grow',
                );
            } else if (
                task instanceof HackingRamTask &&
                task.taskType === 'grow' &&
                this.ns.getServerMoneyAvailable(target.hostname) ===
                    this.ns.getServerMaxMoney(target.hostname)
            ) {
                // TODO: we can probably do better than this, we can stop growing earlier?
                this.taskList[0] = this.createHackTask(
                    target,
                    hackingUtilityModule.moneyEvaluation!,
                    () => hackingUtilityModule.ramProportioningTargets!.money,
                    'money',
                );
            }
        } else {
            if (task instanceof WeakenRamTask) {
                task.killAll();
            }
            this.taskList[0] = new WeakenRamTask(
                this.ns,
                (threads: number) =>
                    this.fill('weakenLooped', threads, 0, target.hostname),
                this.kill,
                hackingUtilityModule.ramProportioningTargets!.money *
                    serverUtilityModule.totalServerRam(),
                target,
            );
        }
    }

    /** Helper task to update the exp strategy implementation */
    @BackgroundTask(30_000)
    updateExp(): void {
        const target = hackingUtilityModule.expEvaluation!.getTarget();
        const task = this.taskList[1];
        if (
            (task instanceof HackingRamTask || task instanceof WeakenRamTask) &&
            task.target === target
        ) {
            if (
                task instanceof WeakenRamTask &&
                this.ns.getServerSecurityLevel(target.hostname) ===
                    this.ns.getServerMinSecurityLevel(target.hostname)
            ) {
                task.killAll();
                this.taskList[1] = this.createHackTask(
                    target,
                    hackingUtilityModule.expEvaluation!,
                    () => hackingUtilityModule.ramProportioningTargets!.exp,
                    'exp',
                );
            }
        } else {
            if (task instanceof WeakenRamTask) {
                task.killAll();
            }
            this.taskList[1] = new WeakenRamTask(
                this.ns,
                (threads: number) =>
                    this.fill('weakenLooped', threads, 1, target.hostname),
                this.kill,
                hackingUtilityModule.ramProportioningTargets!.exp *
                    serverUtilityModule.totalServerRam(),
                target,
            );
        }
    }
}

/**
 * ### HackingSchedulerModule Uniqueness
 * This module implements the hacking policy
 */
export const hackingSchedulerModule = new HackingSchedulerModule();
state.push(hackingSchedulerModule);
