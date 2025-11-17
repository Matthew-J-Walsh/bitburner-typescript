import { NS } from '@ns';
import {
    Time,
    HackScriptType,
    Threads,
    ProcessID,
    scriptMapping,
    maxPeriodForHackingSchedulingFunctions,
    hackScriptTypes,
    HackingScript,
    HackingPolicy,
    Deadzone,
    ActiveScript,
} from '/hacking/constants';
import { HackingElement, HackingBatch } from '/hacking/hackingBatches';
import { HackingEvaluator } from '/hacking/hackingEvaluator';
import { RamTaskManager, WeakenRamTask } from '/hacking/ramTaskManager';
import { LinkedList } from '/lib/linkedList';

/** Task that handles creating new hacking batches */
export class HackingRamTask extends RamTaskManager {
    /** Weaken subtask */
    private weakenRamTask!: WeakenRamTask;
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
    /** Hostname of the last target to tell if we switched targets */
    private lastTarget?: string;

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
        /** Should we force all kills to be hard (use for stock manipulation) */
        protected forceHardKills: boolean = false,
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
                ),
        );
    }
    /**
     * Cancel everything we can as we are switching targets,
     * Only use if switching targets
     */
    private reset(soft: boolean) {
        hackScriptTypes.map((script: HackScriptType) => {
            while (this.scriptQueues[script].peek()) {
                this.scriptQueues[script]
                    .pop()!
                    .kill(soft || this.forceHardKills);
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
            startTime,
            scriptTimes,
            sequencing,
            batchInternalDelay,
        ); // why the fuck is this split
        batch.children.forEach(([script, element]) => {
            this.ns.tprint(`$${script}: ${JSON.stringify(element)}`);
            this.scriptQueues[script].push(element);
        });
        if (batch.children.length !== 0) {
            this.deadZones.push({
                start: Math.floor(
                    startTime + scriptTimes.weaken - 1 - batchInternalDelay,
                ), // Earliest it should end
                end: Math.ceil(
                    startTime +
                        scriptTimes.weaken +
                        batch.children.length * batchInternalDelay,
                ), // Latest it should end
            });
            //this.ns.tprint(
            //    `Pushed deadzone ${Math.floor(
            //        startTime + scriptTimes.weaken - 1 - batchInternalDelay,
            //    )} -> ${Math.ceil(
            //        startTime +
            //            scriptTimes.weaken +
            //            batch.children.length * batchInternalDelay,
            //    )}`,
            //);
        }
    }

    /**
     * Primary management function
     * @returns Time to be yielded to next
     */
    public manage(): Time {
        const currentTime: Time = Date.now();

        if (currentTime <= this.nextManageTime) {
            return this.nextManageTime;
        }

        let policy: HackingPolicy | undefined = this.evaluator.getPolicy();

        // If no policy, we don't do anything
        if (!policy) {
            this.nextManageTime =
                currentTime + maxPeriodForHackingSchedulingFunctions;
            return this.nextManageTime;
        }

        const switched = policy.target.hostname !== this.lastTarget;
        // If we changed targets we need to kill all weakens and then hard reset
        if (switched) {
            this.weakenRamTask.killAll();
            this.reset(false);
            this.nextBatchInitializationTime = 0;
        }

        this.lastTarget = policy.target.hostname;

        // If the sequence length is 0 we need to weaken
        if (policy.sequence.length === 0) {
            this.nextManageTime =
                currentTime + maxPeriodForHackingSchedulingFunctions;
            if (
                !switched &&
                (!this.scriptQueues.hack.isEmpty ||
                    !this.scriptQueues.grow.isEmpty)
            )
                this.ns.tprint(`We somehow lost minimum security ${policy}`);
            this.reset(true); //soft kill any batches
            this.weakenRamTask.manage();
            this.nextBatchInitializationTime = 0;
            return this.nextManageTime;
        }

        this.weakenRamTask.killAll();

        // Clear out old deadzones
        while ((this.deadZones.peek()?.end ?? Infinity) < currentTime) {
            this.deadZones.pop()!;
        }

        this.nextManageTime = Math.floor(currentTime + policy.spacing);

        if (this.nextManageTime > (this.deadZones.peek()?.start ?? Infinity)) {
            this.nextManageTime = this.deadZones.peek()!.end;
        }

        if (policy.spacing < 1) throw new Error('Impending infinite loop');

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

        // Initailize new batches
        this.nextBatchInitializationTime = Math.max(
            this.nextBatchInitializationTime,
            currentTime,
        );
        let i = 0;
        while (this.nextManageTime >= this.nextBatchInitializationTime) {
            if (!Number.isFinite(policy.spacing)) {
                this.ns.tprint(
                    `infinite spacing ??? ${JSON.stringify(policy)}`,
                );
                break;
            }
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
                this.ns.alert(`STOPPING INFINITE LOOP ${policy.spacing}`);
                break;
            }
        }

        // Start the relevant scripts
        hackScriptTypes.forEach((script: HackScriptType) => {
            //if (this.scriptQueues[script].peek()) {
            //    this.ns.tprint(
            //        `Next ${script} @ ${this.scriptQueues[script].peek()?.endTime}... ${nextManageEndTimes[script]}`,
            //    );
            //}
            while (
                /**
                 * If it should have ended by the time it would end if we started it the next manage time,
                 * we should trigger it now
                 * We add a small additional time due to delay concerns for very short scripts
                 */
                (this.scriptQueues[script].peek()?.endTime ?? Infinity) <=
                nextManageEndTimes[script] + batchInternalDelay
            ) {
                const elem = this.scriptQueues[script].pop()!;
                if (
                    /**
                     * If the expected end time of the script is after the nessisary end time + the delay
                     * We kill the batch softly
                     */
                    endTimes[script] + batchInternalDelay / 2 >=
                    elem.endTime
                ) {
                    elem.kill(true);
                    this.missRecorder(
                        `Overtime by ${endTimes[script] + batchInternalDelay / 2 - elem.endTime}ms`,
                    );
                    continue;
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
                        elem.kill(true);
                        this.missRecorder(`${currentTime} Exec missed ${pid}`);
                    }
                    //} else {
                    //this.ns.tprint(
                    //    `${currentTime} Starting ${script} with delay ${elem.endTime - endTimes[script]} for end time ${elem.endTime}`,
                    //);
                    //}
                }
            }
        });

        //this.ns.tprint(
        //    `${currentTime} => ${this.nextManageTime}... ${this.nextBatchInitializationTime}`,
        //);

        return this.nextManageTime;
    }

    public integrityCheck(): void {
        this.weakenRamTask!.integrityCheck();
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
