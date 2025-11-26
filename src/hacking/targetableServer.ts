import { NS, Server } from '@ns';
import {
    ActiveScript,
    growAvgCost,
    growScriptSize,
    hackAvgCost,
    HackScriptType,
    maximumHackedPercent,
    minimumAllowableBatchRam,
    ProcessID,
    scriptCosts,
    scriptMapping,
    Threads,
    Time,
    weakenScriptSize,
} from '/hacking/constants';
import { IntervalTimeline } from '/lib/timeline';
import { QueuedHackCall } from './hackingModule';
import { HackingBatch } from './hackingBatches';
import { lambertWApprox } from '/lib/math/lambertW';

interface TargetState {
    money: number;
    security: number;
}

//Amount of time off a leveling unaffected script can hit, before or after, we need to add in
export const targetedTimeVariance: Time = 100;
//Amount of time between hack windows that we need so that we can actually start runs
export const hackScriptGap: Time = 50;

export class TargetableServer {
    /** Server object */
    public server: Server;
    /** Timeline of the state of the server */
    private timeline!: IntervalTimeline<TargetState>;

    constructor(
        readonly ns: NS,
        hostname: string,
        private readonly queue: (call: QueuedHackCall) => void,
        private readonly exec: (
            script: string,
            threads: Threads,
            fracturable: boolean,
            currentTime: Time,
            startTime: Time,
            endTime: Time,
        ) => ActiveScript[] | undefined,
        private readonly kill: (pid: ProcessID) => void,
    ) {
        this.server = ns.getServer(hostname);
        this.timeline = new IntervalTimeline<TargetState>({
            money: this.server.moneyAvailable!,
            security: this.server.hackDifficulty!,
        });
    }

    private cleanTimeline() {
        this.timeline.pruneBefore();
    }

    private getCurrentState(): TargetState | undefined {
        //we throw an error only if the next state
        this.cleanTimeline();
        const currentTime = Date.now();
        const state = this.timeline.getGuaranteedState();
        const server = this.ns.getServer();
        if (
            state &&
            (state.security < server.hackDifficulty! ||
                state.money > server.moneyAvailable!)
        )
            this.ns.tprint(`Out of state!!!`);

        return state;
    }

    private getEndState(): [Time, TargetState] {
        const state = this.timeline.intervals[-1].state;
        const time = this.timeline.intervals[-1].startMax;
        return [Math.max(time, Date.now()), state];
    }

    private nextMinSecurityTime(): Time {
        let [nextTime, nextState] = this.timeline.nextGuaranteedState();
        let [afterTime, afterState] = this.timeline.nextGuaranteedState(
            nextTime + 1,
        );
        return nextState.security > afterState.security ? afterTime : nextTime;
    }

    private addSequenceToTimeline(
        sequence: Array<[HackScriptType, Threads, Time]>,
        paddingBefore: Time,
        paddingAfter: Time,
    ) {
        let lastState = this.getEndState()[1];
        for (let [script, threads, time] of sequence) {
            lastState = this.stateTransition(lastState, script, threads);
            this.timeline.addInterval(
                time - paddingBefore,
                time + paddingAfter,
                lastState,
            );
        }
    }

    /**
     * Calculates a state transtion due to a script running
     * @param startState
     * @param script
     * @param threads
     * @returns
     */
    private stateTransition(
        startState: TargetState,
        script: HackScriptType,
        threads: Threads,
    ): TargetState {
        switch (script) {
            case 'hack':
            case 'hackF':
                return {
                    money:
                        startState.money *
                        (1 -
                            threads *
                                this.ns.hackAnalyze(this.server.hostname)),
                    security: Math.min(
                        100,
                        startState.security +
                            this.ns.hackAnalyzeSecurity(threads),
                    ),
                };
            case 'grow':
                return {
                    money: this.ns.formulas.hacking.growAmount(
                        this.server,
                        this.ns.getPlayer(),
                        threads,
                    ),
                    security: Math.min(
                        100,
                        startState.security +
                            this.ns.growthAnalyzeSecurity(threads),
                    ),
                };
            case 'weaken':
                return {
                    money: startState.money,
                    security: Math.max(
                        this.server.minDifficulty!,
                        startState.security - this.ns.weakenAnalyze(threads),
                    ),
                };
        }
    }

    public createSequence(
        type: 'money' | 'exp',
        ramAllocation: number,
        timePadding: Time,
    ): Array<[HackScriptType, Threads, Time]> {
        const state = this.getEndState()[1];
        let ramAllowed = ramAllocation / timePadding;

        if (state.security > this.server.minDifficulty!)
            return [
                [
                    'weaken',
                    Math.min(
                        Math.floor(ramAllowed / weakenScriptSize),
                        (state.security - this.server.minDifficulty!) /
                            this.ns.weakenAnalyze(1),
                    ),
                    0,
                ],
            ];

        if (type === 'exp') {
            ramAllowed *= 2;
            let hackCount = Math.floor(
                ramAllowed / growScriptSize +
                    (weakenScriptSize * this.ns.hackAnalyzeSecurity(1)) /
                        this.ns.weakenAnalyze(1),
            );
            let weakenCount = Math.ceil(
                (hackCount * this.ns.hackAnalyzeSecurity(1)) /
                    this.ns.weakenAnalyze(1),
            );
            return [
                ['hackF', hackCount, 0],
                ['weaken', weakenCount, timePadding],
            ];
        }

        if (state.money < this.server.moneyMax!) {
            ramAllowed *= 2;
            let growCount = Math.floor(
                ramAllowed /
                    (growScriptSize +
                        (weakenScriptSize * this.ns.growthAnalyzeSecurity(1)) /
                            this.ns.weakenAnalyze(1)),
            );
            let weakenCount = Math.ceil(
                (growCount * this.ns.growthAnalyzeSecurity(1)) /
                    this.ns.weakenAnalyze(1),
            );
            return [
                ['grow', growCount, 0],
                ['weaken', weakenCount, timePadding],
            ];
        }

        //hwgw
        ramAllowed *= 4;

        const mockServer = structuredClone(this.server);
        mockServer.hackDifficulty = state.security;
        mockServer.moneyAvailable = state.money;
        return hwgwGenerator(this.ns, mockServer, ramAllowed, timePadding);
    }

    /**
     * Queues a type of batch, decides the structure by looking at the expected server state
     * @param type
     * @param ramAllocation
     * @returns The time that we would next start a batch after this one
     */
    public queueBatch(type: 'money' | 'exp', ramAllocation: number): Time {
        this.getCurrentState(); // Just to throw errors and resolve if the state is somehow wrong

        const [startTime, state] = this.getEndState();

        const mockServer = structuredClone(this.server);
        mockServer.hackDifficulty = state.security;

        const paddingAfter = targetedTimeVariance;
        const paddingBefore =
            paddingAfter +
            this.ns.formulas.hacking.weakenTime(
                mockServer,
                this.ns.getPlayer(),
            ) *
                0.01;

        const sequence: Array<[HackScriptType, Threads, Time]> =
            this.createSequence(
                type,
                ramAllocation,
                paddingBefore + paddingAfter + hackScriptGap,
            );
        sequence.forEach(
            (value, idx) => (sequence[idx][2] += startTime + paddingBefore),
        );

        //It needs to be added to the timeline instantly
        this.addSequenceToTimeline(sequence, paddingBefore, paddingAfter);

        const batch = new HackingBatch(this.ns, this, sequence);
        this.queue({
            time: this.nextMinSecurityTime(),
            fn: () => this.manage(batch),
        });

        return sequence[-1][2] + paddingAfter + hackScriptGap;
    }

    public manage(batch: HackingBatch) {
        this.getCurrentState(); // Just to throw errors and resolve if the state is somehow wrong

        let nextTime = this.nextMinSecurityTime();

        if (!batch.manage(nextTime)) {
            this.queue({ time: nextTime, fn: () => this.manage(batch) });
        }
    }

    public fire(
        script: HackScriptType,
        threads: Threads,
        currentTime: Time,
        startTime: Time,
        endTime: Time,
    ): ActiveScript[] | undefined {
        const fracturable = script === 'hackF';
        script = script === 'hackF' ? 'hack' : script;

        const result = this.exec(
            scriptMapping[script],
            threads,
            fracturable,
            currentTime,
            startTime,
            endTime,
        );

        return result;
    }

    public evaluate(type: 'money' | 'exp', ramAllocation: number): number {
        const mockServer = structuredClone(this.server);
        mockServer.hackDifficulty = mockServer.minDifficulty;
        mockServer.moneyAvailable = mockServer.moneyMax;

        const paddingAfter = targetedTimeVariance;
        const paddingBefore =
            paddingAfter +
            this.ns.formulas.hacking.weakenTime(
                mockServer,
                this.ns.getPlayer(),
            ) *
                0.01;
        const timePadding = paddingBefore + paddingAfter + hackScriptGap;

        let ramAllowed = ramAllocation / timePadding;

        if (type === 'exp') {
            ramAllowed *= 2;
            let hackCount = Math.floor(
                ramAllowed / growScriptSize +
                    (weakenScriptSize * this.ns.hackAnalyzeSecurity(1)) /
                        this.ns.weakenAnalyze(1),
            );
            let weakenCount = Math.ceil(
                (hackCount * this.ns.hackAnalyzeSecurity(1)) /
                    this.ns.weakenAnalyze(1),
            );
            const seq: Array<[HackScriptType, Threads, Time]> = [
                ['hackF', hackCount, 0],
                ['weaken', weakenCount, timePadding],
            ];
            return (
                seq.reduce((s, v) => s + v[1], 0) *
                this.ns.formulas.hacking.hackExp(
                    mockServer,
                    this.ns.getPlayer(),
                )
            );
        } else {
            // (type === 'money') {
            const seq = hwgwGenerator(
                this.ns,
                mockServer,
                4 * ramAllowed,
                timePadding,
            );
            return (
                seq[0][1] *
                mockServer.moneyMax! *
                this.ns.formulas.hacking.hackPercent(
                    mockServer,
                    this.ns.getPlayer(),
                )
            );
        }
    }
}

export function hwgwSequenceFromHackCount(
    ns: NS,
    target: Server,
    hackCount: Threads,
    timePadding: Time,
): Array<[HackScriptType, Threads, Time]> {
    const hackedPercent = ns.hackAnalyze(target.hostname);
    hackCount = Math.min(
        Math.floor(maximumHackedPercent / hackedPercent),
        hackCount,
    );
    let hackedFraction = hackedPercent * hackCount;

    const growthFactor = 1 / (1 - hackedFraction);
    const growCount = Math.ceil(
        ns.growthAnalyze(target.hostname, growthFactor),
    );
    const hackWeakens = Math.ceil(
        (hackCount * ns.hackAnalyzeSecurity(1)) / ns.weakenAnalyze(1),
    );
    const growWeakens = Math.ceil(
        (growCount * ns.growthAnalyzeSecurity(1)) / ns.weakenAnalyze(1),
    );
    return [
        ['hack', hackCount, 0],
        ['weaken', hackWeakens, timePadding],
        ['grow', growCount, 2 * timePadding],
        ['weaken', growWeakens, 3 * timePadding],
    ];
}

export function hwgwGenerator(
    ns: NS,
    target: Server,
    ramAllowed: number,
    timePadding: Time,
): Array<[HackScriptType, Threads, Time]> {
    if (ramAllowed < minimumAllowableBatchRam) return [];

    try {
        const hackPercent = ns.hackAnalyze(target.hostname);
        const growPercentLog = Math.log(
            ns.formulas.hacking.growPercent(target, 1, ns.getPlayer()),
        );

        let hackGuess = Math.floor(
            1 / hackPercent -
                (growAvgCost / (growPercentLog * hackAvgCost)) *
                    lambertWApprox(
                        ((growPercentLog * hackAvgCost) /
                            (growAvgCost * hackPercent)) *
                            Math.pow(
                                Math.exp(growPercentLog),
                                (-1 * ramAllowed) / growAvgCost,
                            ) *
                            Math.exp(
                                (growPercentLog * hackAvgCost) /
                                    (growAvgCost * hackPercent),
                            ),
                    ),
        );
        let seq = hwgwSequenceFromHackCount(ns, target, hackGuess, timePadding);
        let i = 0; //infinite loop prevention
        while (seq[0][1] > 0 && i < 1000) {
            if (!seq) return [];

            let ram = seq.reduce(
                (acc, [script, threads, time]) =>
                    acc + scriptCosts[script] * threads,
                0,
            );
            //ns.tprint(
            //    `Looking at sequence with hacks=${hacks}, ram=${ram}, target=${ramPerBatch}`,
            //);
            if (ram <= ramAllowed) {
                return seq;
            }
            seq = hwgwSequenceFromHackCount(
                ns,
                target,
                seq[0][1] - 1,
                timePadding,
            );
            i += 1;
        }
        if (i === 1000) throw new Error('Infinite loop in hwgw calc');
    } catch (error) {
        ns.tprint(`Unable to form a stable hwgw approximate: ${error}`);
    }
    return [];
}
