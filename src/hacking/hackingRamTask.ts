import { NS } from '@ns';
import {
    Time,
    HackScriptType,
    Threads,
    ProcessID,
    scriptMapping,
    maxPeriodForHackingSchedulingFunctions,
    backupSecurityFailureSchedulingDelay,
    hackScriptTypes,
    HackingScript,
} from '/hacking/constants';
import {
    HackingElement,
    Deadzone,
    ActiveScript,
    HackingBatch,
} from '/hacking/hackingBatches';
import { HackingPolicy } from '/hacking/hackingUtilityModule';
import { HackingEvaluator } from './hackingEvaluator';
import { RamTaskManager, WeakenRamTask } from '/hacking/ramTaskManager';
import { LinkedList } from '/lib/linkedList';

/** Task that handles creating new hacking batches */
export class HackingRamTask extends RamTaskManager {
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
                ),
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
                    `${currentTime} => ${this.nextManageTime}... ${this.nextBatchInitializationTime}`,
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
                            Infinity) <=
                        nextManageEndTimes[script] + 100
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
                    this.nextManageTime < Date.now() - 10000 ||
                    this.nextBatchInitializationTime < Date.now() - 10000
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
