import { NS, Server } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import {
    serverUtilityModule,
    scriptMapping,
} from '/hacking/serverUtilityModule';
import {
    hackingUtilityModule,
    BatchSequencing,
} from '/hacking/hackingUtilityModule';
import { Heap } from '/lib/heap';
import { IndexedHeap } from '/lib/indexedHeap';

const startupDelay = 5_000;
/** Built in delay between batch starts */
const batchInternalDelay = 200;
/** Maximum permissible time that a script can end without killing the batch */
const batchMaximumDelay = 100;
/** Time to wait if we aren't at minimum security */
const securityFailureWaitTime = 10;

type HackScript = 'hack' | 'grow' | 'weaken';

/** Element of a hacking batch */
type HackingElement = {
    /** Hacking script to use */
    script: HackScript;
    /** Threads to make */
    threads: number;
    /** Start time, before fired this is an estimate */
    start: number;
    /** End time, before fired this is a target */
    end: number;
    /** Parent batch */
    parent: HackingBatch;
    /** Process id for killing, 0 before firing */
    pid: number;
};

/** A batch of hack scripts */
type HackingBatch = {
    /** HackingElements making up the batch */
    elements: Array<HackingElement>;
    /** If the batch has been killed */
    killed: boolean;
};

class HackingTarget {
    /**
     * Stage of server. TODO: For the moment we don't support partial stages
     * @stage=0 Unweakened
     * @stage=1 Fully Weakened
     * @stage=2 Fully grown
     */
    stage: number = 0;
    /** When the next batch should be fired off */
    nextBatchInitializationTime: number = 0;
    /** Queue of batch elements that need to be scheduled */
    batchQueue: Heap<HackingElement> = new Heap<HackingElement>(
        (a, b) => b.start - a.start,
    );
    /** Queue of HackingBatches that have been started */
    activateBatches: Heap<HackingBatch> = new Heap<HackingBatch>(
        (a, b) => b.elements[0]!.start - a.elements[0]!.start,
    );

    constructor(
        private ns: NS,
        /** Script to fire off a new run */
        private fire: (script: HackScript, threads: number) => number,
        /** Script to fire when we needed to cancel a batch */
        private missRecorder: () => void,
        /** Target to hack */
        public target: Server,
        /** Sequences for every stage */
        private stagedSequencing: BatchSequencing[],
    ) {}

    public updateStagedSequencing(newSequencing: BatchSequencing[]): void {
        this.stagedSequencing = newSequencing;
    }

    /** Checks and potentially updates the current stage */
    private updateStage(): boolean {
        if (this.stage === this.stagedSequencing.length) {
            return false;
        }
        if (
            this.stage === 0 &&
            this.ns.getServerMinSecurityLevel(this.target.hostname) ===
                this.ns.getServerSecurityLevel(this.target.hostname)
        ) {
            this.stage = 1;
            return true;
        }
        if (
            this.stage === 1 &&
            this.ns.getServerMaxMoney(this.target.hostname) ===
                this.ns.getServerMoneyAvailable(this.target.hostname)
        ) {
            this.stage = 2;
            return true;
        }
        return false;
    }

    /**  Returns if we aren't above minimum security but aren't at stage 0 */
    private verifyStage1(): boolean {
        if (
            this.stage >= 1 &&
            this.ns.getServerMinSecurityLevel(this.target.hostname) !=
                this.ns.getServerSecurityLevel(this.target.hostname)
        ) {
            return false;
        }
        return true;
    }

    /** Main scheduling operation, responsible for scheduling */
    schedule(): number {
        // Update the stage
        if (this.updateStage()) {
            if (!this.killAll()) {
                this.ns.tprint('Fatal error in HackTarget.schedule()');
                return Date.now() * 2;
            } else {
                this.nextBatchInitializationTime = 0;
            }
        }

        // Verify security if not fixing security
        if (!this.verifyStage1()) {
            return securityFailureWaitTime;
        }

        const hackTime = this.ns.getHackTime(this.target.hostname);
        const times = {
            hack: hackTime,
            grow: 3.2 * hackTime,
            weaken: 4 * hackTime,
        };
        const currentTime = Date.now();

        // Start new batches
        if (currentTime >= this.nextBatchInitializationTime) {
            this.startBatch(currentTime, times);
        }

        // Update the start times until this.nextBatchInitializationTime
        const elementsToUpdate = Array<HackingElement>();
        while (
            this.batchQueue.size() > 0 &&
            this.batchQueue.peek()!.start < this.nextBatchInitializationTime
        ) {
            if (this.batchQueue.peek()!.parent.killed) {
                this.batchQueue.pop()!;
            } else {
                elementsToUpdate.push(this.batchQueue.pop()!);
            }
        }
        elementsToUpdate.forEach((element) => {
            element.start = element.end - times[element.script];
            this.batchQueue.push(element);
        });

        // Finally we queue what should be
        while (
            this.batchQueue.size() > 0 &&
            this.batchQueue.peek()!.start < currentTime
        ) {
            if (this.batchQueue.peek()!.parent.killed) {
                this.batchQueue.pop()!;
            } else {
                const element = this.batchQueue.pop()!;
                element.start = currentTime;
                const newEnd = currentTime + times[element.script];
                if (newEnd <= element.end + batchMaximumDelay) {
                    element.end = newEnd;
                    element.pid = this.fire(element.script, element.threads);
                    if (element.pid) {
                        element.start = currentTime;
                    } else {
                        this.kill(element.parent);
                        this.missRecorder();
                    }
                } else {
                    this.kill(element.parent);
                    this.missRecorder();
                }
            }
        }

        // Return when we want to be yielded back to
        if (
            this.batchQueue.size() > 0 &&
            this.batchQueue.peek()!.start < this.nextBatchInitializationTime
        ) {
            return this.batchQueue.peek()!.start;
        } else {
            return this.nextBatchInitializationTime;
        }
    }

    /**
     * Starts a batch
     * @param currentTime Date.now()
     * @param times Up to date times for hack grow and weaken
     */
    private startBatch(
        currentTime: number,
        times: { hack: number; grow: number; weaken: number },
    ) {
        const startingScript = this.stagedSequencing[this.stage].scripts[0];
        const success = this.fire(
            startingScript.script,
            startingScript.threads,
        );
        if (success) {
            const endTime = currentTime + times[startingScript.script];

            const batch: HackingBatch = {
                elements: [],
                killed: false,
            };
            this.stagedSequencing[this.stage].scripts.forEach((element, idx) =>
                batch.elements.push({
                    script: element.script,
                    threads: element.threads,
                    start:
                        endTime +
                        idx * batchInternalDelay -
                        times[element.script],
                    end: endTime + idx * batchInternalDelay,
                    parent: batch,
                    pid: 0,
                }),
            );
            batch.elements[0].pid = success;

            this.activateBatches.push(batch);
        }
    }

    /**
     * Kills a targeted batch
     * @param batch Batch to kill
     * @returns If sucessful
     */
    kill(batch: HackingBatch): boolean {
        batch.killed = true;
        return batch.elements.reduce((result, element) => {
            if (element.pid) {
                result = result && this.ns.kill(element.pid!);
            }
            return result;
        }, true);
    }

    /**
     * Kills all batches under this target
     * @returns If sucessful
     */
    public killAll(): boolean {
        var result = true;
        while (this.activateBatches.size() > 0) {
            result = result && this.kill(this.activateBatches.pop()!);
        }
        return result;
    }

    /**
     * Attemps to drop at least a specific amount of ram currently in use.
     * This is considered a miss.
     * @param requestedRam Amount of ram to free
     */
    public dispenseRam(requestedRam: number): boolean {
        this.missRecorder();
        return this.killAll(); //TODO: Make this more reasonable XD
    }
}

class InitialHackingTarget extends HackingTarget {
    schedule(): number {
        return startupDelay;
    }
}

type FillerScript = {
    pid: number;
    threads: number;
};

class FillerRamTask {
    /** Scripts currently in managment by this script */
    managedScripts: Map<string, FillerScript> = new Map();
    /** Ram per thread of the filler task */
    ramPerThread: number = 0;

    constructor(
        private ns: NS,
        private scriptName: string,
    ) {
        this.ramPerThread = this.ns.getScriptRam(scriptName);
    }

    /**
     * Fills a specific amount of ram on a server with.
     * @param server Server to run it on
     * @param ramToFill Amount of ram that this may used, assumes that much ram is free
     */
    public fill(server: string, ramToFill: number): void {
        if (this.managedScripts.has(server)) {
            const old = this.managedScripts.get(server)!;
            ramToFill += old.threads * this.ramPerThread;
            this.ns.kill(old.pid);
            this.managedScripts.delete(server);
        }

        const threadCount = Math.floor(ramToFill / this.ramPerThread);
        const newPid = this.ns.exec(this.scriptName, server, threadCount);
        if (newPid) {
            this.managedScripts.set(server, {
                pid: newPid,
                threads: threadCount,
            });
        } else {
            this.ns.tprint('Potentially fatal error in FillerRamTask.fill()');
        }
    }

    /**
     * Kills the filler task on a server
     * @param server Server to kill task on
     * @returns If successful
     */
    public kill(server: string): boolean {
        if (this.managedScripts.has(server)) {
            const success = this.ns.kill(this.managedScripts.get(server)!.pid);
            this.managedScripts.delete(server);
            return success;
        } else {
            return false;
        }
    }
}

type RamSpace = {
    server: Server;
    avaiableRam: number;
};

class HackingSchedulerModule extends BaseModule {
    taskList: {
        0?: HackingTarget;
        1?: HackingTarget;
        2?: FillerRamTask;
    } = {};
    nextCallTimes: {
        0: number;
        1: number;
    } = {
        0: Date.now() + startupDelay,
        1: Date.now() + startupDelay,
    };
    priorityRamSpaceUsedMap: {
        0: IndexedHeap<string, RamSpace>;
        1: IndexedHeap<string, RamSpace>;
        2: IndexedHeap<string, RamSpace>;
    } = {
        0: new IndexedHeap<string, RamSpace>(
            (a, b) => b.avaiableRam - a.avaiableRam,
            (a) => a.server.hostname,
        ),
        1: new IndexedHeap<string, RamSpace>(
            (a, b) => b.avaiableRam - a.avaiableRam,
            (a) => a.server.hostname,
        ),
        2: new IndexedHeap<string, RamSpace>(
            (a, b) => b.avaiableRam - a.avaiableRam,
            (a) => a.server.hostname,
        ),
    };

    init(ns: NS) {
        super.init(ns);

        this.taskList = {
            0: new InitialHackingTarget(
                this.ns,
                (script: HackScript, threads: number) => 0,
                () => 0,
                ns.getServer('home'),
                [],
            ),
            1: new InitialHackingTarget(
                this.ns,
                (script: HackScript, threads: number) => 0,
                () => 0,
                ns.getServer('home'),
                [],
            ),
            2: new FillerRamTask(ns, scriptMapping.share),
        };
    }

    private setMaker(
        target: Server,
        stagedSequencing: BatchSequencing[],
        priority: 0 | 1,
    ) {
        if (
            this.taskList[priority] != null &&
            this.taskList[priority]!.target.hostname != target.hostname
        ) {
            this.taskList[priority]!.killAll();
        }
        if (
            this.taskList[priority] === null ||
            this.taskList[priority]!.target.hostname != target.hostname
        ) {
            const fireForTarget = (script: HackScript, threads: number) =>
                this.fire(target.hostname, script, threads, priority);
            this.taskList[priority] = new HackingTarget(
                this.ns,
                fireForTarget,
                () => 0,
                target,
                stagedSequencing,
            );
        } else {
            this.taskList[priority]!.updateStagedSequencing(stagedSequencing);
        }
    }

    /** Updates the money maker */
    public setMoneyMaker = (
        target: Server,
        stagedSequencing: BatchSequencing[],
    ) => this.setMaker(target, stagedSequencing, 0);

    /** Updates the exp maker */
    public setExpMaker = (
        target: Server,
        stagedSequencing: BatchSequencing[],
    ) => this.setMaker(target, stagedSequencing, 1);

    /**
     * Fires off a script with a particular amount of RAM
     * @param target
     * @param script
     * @param threads
     * @param priority
     * @returns
     */
    private fire(
        target: string,
        script: HackScript,
        threads: number,
        priority: number,
    ): number {
        const neededRam = this.ns.getScriptRam(scriptMapping[script]) * threads;
        const placementServer = this.requestRam(neededRam, priority + 1);
        if (placementServer) {
            return this.ns.exec(
                scriptMapping[script],
                placementServer.hostname,
                threads,
                target,
            );
        } else {
            return 0;
        }
    }

    /**
     * Finds or creates a server with the nessisary ram
     * @param neededRam Amount of ram requested
     * @param priority What priority to free ram for, will only cancel 'lower' priority
     */
    private requestRam(neededRam: number, priority: number): Server | void {}

    /** Handles the scheduling */
    @PriorityTask
    schedule(): number {
        const currentTime = Date.now();

        if (this.nextCallTimes[0] <= currentTime) {
            this.nextCallTimes[0] = this.taskList[0]!.schedule();
        }
        if (this.nextCallTimes[1] <= currentTime) {
            this.nextCallTimes[1] = this.taskList[1]!.schedule();
        }

        serverUtilityModule.ourServers.forEach((server) => {
            server.maxRam -
                this.priorityRamSpaceUsedMap[2].getByKey(server.hostname)!
                    .avaiableRam;
        });

        return Math.min(this.nextCallTimes[0], this.nextCallTimes[1]);
    }
}

/**
 * ### HackingSchedulerModule Uniqueness
 * This modules handles Ram management for hacking processes, shares, and staneks
 * It follows the setup form hackingUtilityModule
 */
export const hackingSchedulerModule = new HackingSchedulerModule();
state.push(hackingSchedulerModule);
