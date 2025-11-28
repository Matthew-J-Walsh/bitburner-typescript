import { NS, Server } from '@ns';
import {
    ActiveScript,
    growAvgCost,
    growScriptSize,
    hackAvgCost,
    hackScriptGap,
    HackScriptType,
    maximumHackedPercent,
    minimumAllowableBatchRam,
    ProcessID,
    scriptCosts,
    scriptExpectedDelay,
    scriptMapping,
    targetedTimeVariance,
    Threads,
    Time,
    weakenScriptSize,
} from '/hacking/constants';
import { lambertWApprox } from '/lib/math/lambertW';
import { QueuedCall } from './queueManagementModule';

function getScriptTime(ns: NS, script: HackScriptType, hostname: string): Time {
    switch (script) {
        case 'hack':
        case 'hackF':
            return ns.getHackTime(hostname);
        case 'grow':
            return ns.getGrowTime(hostname);
        case 'weaken':
            return ns.getWeakenTime(hostname);
        default:
            throw new Error('getScriptTime');
    }
}

export class TargetableServer {
    /** Server object */
    public server: Server;
    /** Safe points */
    public safePoints: Array<Time> = [];
    /** debugging */
    public lastType: string = 'weaken';

    constructor(
        readonly ns: NS,
        hostname: string,
        private readonly queue: (call: QueuedCall) => void,
        private readonly exec: (
            script: string,
            threads: Threads,
            fracturable: boolean,
            target: string,
            currentTime: Time,
            startTime: Time,
            endTime: Time,
        ) => ActiveScript[] | undefined,
        private readonly kill: (pid: ProcessID) => void,
    ) {
        this.server = ns.getServer(hostname);
    }

    public cleanSafePoints() {
        const now = Date.now();
        const index = this.safePoints.findIndex((time) => time > now);
        this.safePoints = index === -1 ? [] : this.safePoints.slice(index);
    }

    public createSequence(
        type: 'money' | 'exp',
        ramAllocation: number,
        timePadding: Time,
    ): Array<[HackScriptType, Threads, Time]> {
        let ramAllowed =
            (timePadding * ramAllocation) /
            Math.max(this.ns.getWeakenTime(this.server.hostname), timePadding);

        if (
            this.ns.getServerSecurityLevel(this.server.hostname) >
            this.ns.getServerMinSecurityLevel(this.server.hostname)
        ) {
            if (this.lastType !== 'weaken')
                this.ns.tprint(
                    `lost security ${this.ns.getServerMinSecurityLevel(this.server.hostname)} -> ${this.ns.getServerSecurityLevel(this.server.hostname)}`,
                );
            this.lastType = 'weaken';
            return [
                [
                    'weaken',
                    Math.ceil(
                        Math.min(
                            ramAllowed / weakenScriptSize,
                            (this.ns.getServerSecurityLevel(
                                this.server.hostname,
                            ) -
                                this.ns.getServerMinSecurityLevel(
                                    this.server.hostname,
                                )) /
                                this.ns.weakenAnalyze(1),
                        ),
                    ),
                    0,
                ],
            ];
        }

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
            this.lastType = 'hack';
            return [
                ['hackF', hackCount, 0],
                ['weaken', weakenCount, timePadding],
            ];
        }

        if (
            this.ns.getServerMoneyAvailable(this.server.hostname) <
            this.ns.getServerMaxMoney(this.server.hostname)
        ) {
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
            if (this.lastType !== 'grow' && this.lastType !== 'weaken')
                this.ns.tprint(
                    `lost grow ${this.ns.getServerMaxMoney(this.server.hostname)} -> ${this.ns.getServerMoneyAvailable(this.server.hostname)}`,
                );
            this.lastType = 'grow';
            return [
                ['grow', growCount, 0],
                ['weaken', weakenCount, timePadding],
            ];
        }

        this.lastType = 'hack';
        //hwgw
        ramAllowed *= 4;
        return hwgwGenerator(this.ns, this.server, ramAllowed, timePadding);
    }

    /**
     * Queues a type of batch, decides the structure by looking at the expected server state
     * @param type
     * @param ramAllocation
     * @returns The time that we would next start a batch after this one
     */
    public startBatch(type: 'money' | 'exp', ramAllocation: number): Time {
        const currentTime = Date.now();
        const paddingAfter = targetedTimeVariance;
        const paddingBefore = Math.ceil(
            paddingAfter +
                this.ns.formulas.hacking.weakenTime(
                    this.server,
                    this.ns.getPlayer(),
                ) *
                    0.01,
        );

        const sequence: Array<[HackScriptType, Threads, Time]> =
            this.createSequence(
                type,
                ramAllocation,
                paddingBefore + paddingAfter + hackScriptGap,
            );
        sequence.forEach(
            (value, idx) =>
                (sequence[idx][2] = Math.ceil(
                    sequence[idx][2] +
                        currentTime +
                        this.ns.getWeakenTime(this.server.hostname) +
                        scriptExpectedDelay,
                )),
        );
        const firedScripts = sequence.map(([script, threads, endTime], idx) =>
            this.fire(
                script,
                threads,
                currentTime,
                Math.ceil(
                    endTime -
                        getScriptTime(this.ns, script, this.server.hostname),
                ),
                endTime,
            ),
        );

        if (!firedScripts.every((scripts) => scripts)) {
            this.ns.tprint(
                `Not all scripts fired. Killing batch, RAM WARNING!`,
            );
            firedScripts.forEach((scripts) =>
                scripts?.forEach((script) => this.kill(script.pid)),
            );
        }

        this.safePoints.push(sequence[sequence.length - 1][2] + paddingAfter);

        /**this.ns.tprint(
            `${Date.now()} Started batch with ${sequence}\nReturn: ${Math.ceil(
                sequence[sequence.length - 1][2] +
                    paddingAfter +
                    hackScriptGap -
                    this.ns.getWeakenTime(this.server.hostname),
            )}`,
        );*/
        let nextCallDelay = Math.ceil(
            sequence[sequence.length - 1][2] +
                paddingBefore +
                paddingAfter +
                hackScriptGap -
                this.ns.getWeakenTime(this.server.hostname) -
                currentTime,
        );

        this.cleanSafePoints();
        const nextSafePoint = this.safePoints[0] ?? Infinity;

        nextCallDelay =
            (nextSafePoint - currentTime) / 2 > nextCallDelay
                ? nextCallDelay
                : nextSafePoint - currentTime;

        this.ns.write(
            `logs/scripts/${this.server.hostname}ends.txt`,
            `${Date.now()} Fire! ${sequence.length === 1 ? 'weaken' : sequence.length === 2 ? 'grow' : 'hack'} 
            for ${sequence[0][2]} -> ${sequence[sequence.length - 1][2]}\n\tNext Fire: ${Date.now() + nextCallDelay}... safty: ${nextSafePoint}\n`,
            'a',
        );

        return currentTime + nextCallDelay;
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
            this.server.hostname,
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
        if (
            mockServer.hackDifficulty !== mockServer.minDifficulty ||
            mockServer.moneyAvailable !== mockServer.moneyMax
        )
            throw new Error('????');

        const paddingAfter = targetedTimeVariance;
        const paddingBefore =
            paddingAfter +
            this.ns.formulas.hacking.weakenTime(
                mockServer,
                this.ns.getPlayer(),
            ) *
                0.01;
        const timePadding = paddingBefore + paddingAfter + hackScriptGap;

        let ramAllowed =
            (ramAllocation * timePadding) /
            this.ns.formulas.hacking.weakenTime(
                mockServer,
                this.ns.getPlayer(),
            );

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
            ramAllowed *= 4;
            // (type === 'money') {
            const seq = hwgwGenerator(
                this.ns,
                mockServer,
                ramAllowed,
                timePadding,
            );
            if (seq.length !== 4) return 0;
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
