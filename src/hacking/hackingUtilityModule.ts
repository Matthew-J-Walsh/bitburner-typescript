import { NS, Player, Server } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { serverUtilityModule } from '/hacking/serverUtilityModule';
import {
    minimalTimeBetweenPerPair,
    HackScriptType,
    HackingScript,
    gwStructure,
    hwgwStructure,
    hwStructure,
    hackScriptSize,
    growScriptSize,
    weakenScriptSize,
    hackFort,
    growFort,
    weakenFort,
    hackAvgCost,
    growAvgCost,
    scriptCosts,
} from '/hacking/constants';
import { lambertWApprox } from '/lib/math/lambertW';

export type HackingPolicy = {
    /** Home for do nothing */
    target: Server;
    spacing: number;
    /** Empty for weaken */
    sequence: HackingScript[];
};

// Formulas should be free, change my mind
export class HackingUtilityFunctions {
    static growAmount(
        ns: NS,
        server: Server,
        player: Player,
        threads: number,
        cores: number = 1,
    ): number {
        return 0;
    }

    static growPercentLog(
        ns: NS,
        server: Server,
        threads: number,
        player: Player,
        cores: number = 1,
    ): number {
        const hackDifficulty = server.hackDifficulty ?? 100;
        const numServerGrowthCycles = Math.max(threads, 0);

        let adjGrowthLog = Math.log1p(0.03 / hackDifficulty);
        if (adjGrowthLog >= 0.00349388925425578) {
            adjGrowthLog = 0.00349388925425578;
        }

        const serverGrowthPercentage =
            ns.getServerGrowth(server.hostname) / 100;
        const serverGrowthPercentageAdjusted = serverGrowthPercentage * 1; //currentNodeMults.ServerGrowthRate;

        const coreBonus = 1 + (cores - 1) * (1 / 16);
        return (
            adjGrowthLog *
            serverGrowthPercentageAdjusted *
            player.mults.hacking_grow *
            coreBonus *
            numServerGrowthCycles
        );
    }

    static growPercent(
        ns: NS,
        server: Server,
        threads: number,
        player: Player,
        cores: number = 1,
    ): number {
        return Math.exp(
            this.growPercentLog(ns, server, threads, player, cores),
        );
    }

    static growThreads(
        ns: NS,
        server: Server,
        player: Player,
        targetMoney: number,
        cores: number = 1,
    ): number {
        var startMoney = ns.getServerMoneyAvailable(server.hostname);
        const moneyMax = server.moneyMax ?? 1;

        if (startMoney < 0) startMoney = 0; // servers "can't" have less than 0 dollars on them
        if (targetMoney > moneyMax) targetMoney = moneyMax; // can't grow a server to more than its moneyMax
        if (targetMoney <= startMoney) return 0; // no growth --> no threads

        const k = this.growPercentLog(ns, server, 1, player, cores);

        const guess =
            (targetMoney - startMoney) /
            (1 + (targetMoney * (1 / 16) + startMoney * (15 / 16)) * k);
        let x = guess;
        let diff;
        do {
            const ox = startMoney + x;
            const newx = (x - ox * Math.log(ox / targetMoney)) / (1 + ox * k);
            diff = newx - x;
            x = newx;
        } while (diff < -1 || diff > 1);

        const ccycle = Math.ceil(x);
        if (ccycle - x > 0.999999) {
            const fcycle = ccycle - 1;
            if (targetMoney <= (startMoney + fcycle) * Math.exp(k * fcycle)) {
                return fcycle;
            }
        }
        if (ccycle >= x + ((diff <= 0 ? -diff : diff) + 0.000001)) {
            return ccycle;
        }
        if (targetMoney <= (startMoney + ccycle) * Math.exp(k * ccycle)) {
            return ccycle;
        }
        return ccycle + 1;
    }
    static hackChance(ns: NS, server: Server, player: Player): number {
        const hackDifficulty = server.hackDifficulty ?? 100;
        const requiredHackingSkill = server.requiredHackingSkill ?? 1e9;
        // Unrooted or unhackable server
        if (!server.hasAdminRights || hackDifficulty >= 100) return 0;
        const hackFactor = 1.75;
        const difficultyMult = (100 - hackDifficulty) / 100;
        const skillMult = Math.max(hackFactor * player.skills.hacking, 1);
        const skillChance = (skillMult - requiredHackingSkill) / skillMult;
        const chance =
            skillChance * difficultyMult * player.mults.hacking_chance * 1; //calculateIntelligenceBonus(player.skills.intelligence, 1);
        return Math.max(0, Math.min(1, chance));
    }
    static hackExp(ns: NS, server: Server, player: Player): number {
        const baseDifficulty = server.baseDifficulty;
        if (!baseDifficulty) return 0;
        const baseExpGain = 3;
        const diffFactor = 0.3;
        let expGain = baseExpGain;
        expGain += baseDifficulty * diffFactor;
        return expGain * player.mults.hacking_exp;
    }
    static hackPercent(ns: NS, server: Server, player: Player): number {
        const hackDifficulty = server.hackDifficulty ?? 100;
        if (hackDifficulty >= 100) return 0;
        const requiredHackingSkill = server.requiredHackingSkill ?? 1e9;
        // Adjust if needed for balancing. This is the divisor for the final calculation
        const balanceFactor = 240;

        const difficultyMult = (100 - hackDifficulty) / 100;
        const skillMult =
            (player.skills.hacking - (requiredHackingSkill - 1)) /
            player.skills.hacking;
        const percentMoneyHacked =
            (difficultyMult * skillMult * player.mults.hacking_money * 1) /
            balanceFactor; //currentNodeMults.ScriptHackMoney

        return Math.min(1, Math.max(percentMoneyHacked, 0));
    }
    static hackTime(server: Server, player: Player): number {
        const difficultyMult =
            server.requiredHackingSkill! * server.hackDifficulty!;

        const baseDiff = 500;
        const baseSkill = 50;
        const diffFactor = 2.5;
        let skillFactor = diffFactor * difficultyMult + baseDiff;
        skillFactor /= player.skills.hacking + baseSkill;

        const hackTimeMultiplier = 5;
        const hackingTime =
            (hackTimeMultiplier * skillFactor) /
            (player.mults.hacking_speed *
                1 * //currentNodeMults.HackingSpeedMultiplier
                1); //calculateIntelligenceBonus(player.skills.intelligence, 1)

        return hackingTime;
    }

    static hwgwSequencesFromHackCount(
        ns: NS,
        server: Server,
        hackCount: number,
    ): HackingScript[] | undefined {
        const hackedFraction = ns.hackAnalyze(server.hostname) * hackCount;
        if (hackedFraction > 1.0) {
            //ns.tprint(`Overshoot: ${hackedFraction}`);
            return;
        }
        const growthFactor = 1 / (1 - hackedFraction);
        const growCount = Math.ceil(
            ns.growthAnalyze(server.hostname, growthFactor),
        );
        const hackWeakens = Math.ceil((hackCount * hackFort) / weakenFort);
        const growWeakens = Math.ceil((growCount * growFort) / weakenFort);
        return [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: hackWeakens },
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: growWeakens },
        ];
    }

    static sequenceRam(sequence: HackingScript[]): number {
        return sequence.reduce(
            (acc, script) => acc + scriptCosts[script.script] * script.threads,
            0,
        );
    }

    /**
     * Get the number of batches to aim for
     * @param weakenTime Weaken time (one full cycle time)
     * @param structure Structure being used
     * @returns Number of batches to aim for
     */
    public static getBatches(
        weakenTime: number,
        structure: HackScriptType[],
    ): number {
        let maxBatches = Math.floor(
            weakenTime / ((structure.length - 1) * minimalTimeBetweenPerPair),
        );
        maxBatches = Math.min(maxBatches, structure.length === 2 ? 51 : 21);
        while (
            maxBatches > 0 &&
            ((maxBatches % 4 === 0 && 'grow' in structure) ||
                (maxBatches % 5 === 0 && 'hack' in structure))
        ) {
            maxBatches--;
        }

        return maxBatches;
    }

    /**
     * Gets the approximation for sequencing a hack-weaken-grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceHWGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation === 0) return [];

        const ramPerBatch = ramAllocation / batches;
        const player = ns.getPlayer();
        const hackPercent = ns.hackAnalyze(target.hostname);
        const growPercentLog = HackingUtilityFunctions.growPercentLog(
            ns,
            target,
            1,
            player,
        );

        let hacks = Math.floor(
            1 / hackPercent -
                (growAvgCost / (growPercentLog * hackAvgCost)) *
                    lambertWApprox(
                        ((growPercentLog * hackAvgCost) /
                            (growAvgCost * hackPercent)) *
                            Math.pow(
                                Math.exp(growPercentLog),
                                (-1 * ramPerBatch) / growAvgCost,
                            ) *
                            Math.exp(
                                (growPercentLog * hackAvgCost) /
                                    (growAvgCost * hackPercent),
                            ),
                    ),
        );
        while (hacks * hackPercent > 0.9) {
            hacks -= 1;
        }
        while (hacks > 0) {
            let seq = HackingUtilityFunctions.hwgwSequencesFromHackCount(
                ns,
                target,
                hacks,
            );
            if (!seq) return [];

            let ram = HackingUtilityFunctions.sequenceRam(seq);
            //ns.tprint(
            //    `Looking at sequence with hacks=${hacks}, ram=${ram}, target=${ramPerBatch}`,
            //);
            if (ram <= ramPerBatch) {
                return seq;
            }
            hacks -= 1;
        }
        return [];
    }

    /**
     * Gets the approximation for sequencing a hack-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceHW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation === 0) return [];
        const ramPerBatch = ramAllocation / batches;

        let hackCount = Math.floor(ramPerBatch / hackAvgCost);
        if (hackCount === 0) return [];
        let weakenCount = Math.ceil((hackCount * hackFort) / weakenFort);
        if (!(Number.isInteger(hackCount) && Number.isInteger(weakenCount)))
            throw new Error('WTF');
        let seq: HackingScript[] = [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: weakenCount },
        ];
        if (HackingUtilityFunctions.sequenceRam(seq) > ramPerBatch * 1.1) {
            throw new Error(
                `WTF2 ${ramPerBatch} ${hackAvgCost}, ${hackCount} ${weakenCount}, ${HackingUtilityFunctions.sequenceRam(seq)}`,
            );
        }
        if (hackCount === 0 || weakenCount === 0) {
            throw new Error(
                `WTF3: ${ramPerBatch}, ${hackAvgCost},
                 ${hackCount}, ${weakenCount}`,
            );
        }

        return seq;
    }

    /**
     * Gets the approximation for sequencing a grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public static getSequenceGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        if (ramAllocation === 0) return [];
        const ramPerBatch = ramAllocation / batches;

        let growCount = Math.floor(ramPerBatch / growAvgCost);
        if (growCount === 0) return [];
        let weakenCount = Math.ceil((growCount * growFort) / weakenFort);
        if (!(Number.isInteger(growCount) && Number.isInteger(weakenCount)))
            throw new Error('WTF');
        let seq: HackingScript[] = [
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: weakenCount },
        ];
        if (HackingUtilityFunctions.sequenceRam(seq) > ramPerBatch * 1.1) {
            throw new Error(
                `WTF2 ${ramPerBatch} ${growAvgCost}, ${growCount} ${weakenCount}, ${HackingUtilityFunctions.sequenceRam(seq)}`,
            );
        }
        if (growCount === 0 || weakenCount === 0) {
            throw new Error(
                `WTF3: ${ramPerBatch}, ${growAvgCost}, ${growCount}, ${weakenCount}`,
            );
        }

        return seq;
    }

    public static generateHackScriptPolicy(
        ns: NS,
        target: Server,
        ramAllocation: number,
        structure: HackScriptType[],
        getSeq: (
            ns: NS,
            target: Server,
            batches: number,
            ramAllocation: number,
        ) => HackingScript[],
    ): HackingPolicy {
        const weakenTime = ns.getWeakenTime(target.hostname);
        const batches = HackingUtilityFunctions.getBatches(
            weakenTime,
            structure,
        );
        return {
            target: target,
            spacing: weakenTime / batches,
            sequence: getSeq(ns, target, batches, ramAllocation),
        };
    }
}

export abstract class HackingEvaluator {
    /** NS */
    protected ns?: NS;
    /** Income formula for this evaluator */
    private incomeFormula: (server: Server) => number = (server: Server) => 0;
    /** Cost formula for this evaluator */
    private costFormula: (server: Server) => number = (server: Server) => 0;
    /** Estimated incomes of the different server options */
    private incomeEstimates: Array<number> = [];
    /** Estimated change costs of the different server options */
    private costEstimates: Array<number> = [];
    /** Current target */
    protected _target?: Server;
    /** Current amount of ram to allocate to this evaluator */
    public ramAllocation: number = 0;
    /** Stage of the evaluator */
    public stage: number = -1;
    /** Last hwgw hack count */
    public hwgwMemoHack: number = 1;

    public init(
        ns: NS,
        incomeFormula: (server: Server) => number,
        costFormula: (server: Server) => number,
    ) {
        this.ns = ns;
        this.incomeFormula = incomeFormula;
        this.costFormula = costFormula;
    }

    protected iterateOverServers<T>(fn: (server: Server) => T): Array<T> {
        return serverUtilityModule.targetableServers.map((server) =>
            fn(server),
        );
    }

    /** Updates current evaluations and the target */
    public update() {
        this.incomeEstimates = this.iterateOverServers(this.incomeFormula);
        this.costEstimates = this.iterateOverServers(this.costFormula);
        const best = this.incomeEstimates.reduce(
            (best, val, idx) =>
                val > best.value ? { value: val, index: idx } : best,
            { value: this.incomeEstimates[0], index: 0 },
        );

        if (
            !this._target ||
            this._target.hostname !=
                serverUtilityModule.targetableServers[best.index].hostname
        ) {
            this.stage = 0;
        }
        this._target = serverUtilityModule.targetableServers[best.index];
    }

    get target(): Server {
        if (this._target) {
            return this._target;
        } else {
            return this.ns!.getServer('home');
        }
    }

    /** Get the policy for this evaluator at the moment */
    public abstract getPolicy(): HackingPolicy | undefined;

    public log(): Record<string, any> {
        const topTwo = this.incomeEstimates.reduce(
            (topTwo, val, idx) =>
                val > topTwo.best.value
                    ? { best: { value: val, index: idx }, second: topTwo.best }
                    : topTwo,
            {
                best: { value: this.incomeEstimates[0], index: 0 },
                second: { value: this.incomeEstimates[0], index: 0 },
            },
        );
        return {
            stage: this.stage,
            ramAllocation: this.ramAllocation,
            policy: this.target ? this.getPolicy() : {},
            best: serverUtilityModule.targetableServers[topTwo.best.index],
            bestValue: topTwo.best.value,
            hghwBatches: HackingUtilityFunctions.getBatches(
                this.ns!.getWeakenTime(
                    serverUtilityModule.targetableServers[topTwo.best.index]
                        .hostname,
                ),
                hwgwStructure,
            ),
            second: serverUtilityModule.targetableServers[topTwo.second.index],
            secondValue: topTwo.second.value,
        };
    }
}

class MoneyEvaluator extends HackingEvaluator {
    public getPolicy(): HackingPolicy | undefined {
        if (!this._target) return;
        switch (this.stage) {
            case -1:
                return;
            case 0:
                if (
                    this.ns!.getServerSecurityLevel(this._target!.hostname) ===
                    this.ns!.getServerMinSecurityLevel(this._target!.hostname)
                ) {
                    this.stage = 1;
                } else {
                    return { target: this._target!, spacing: 0, sequence: [] };
                }
            case 1:
                if (
                    this.ns!.getServerMoneyAvailable(this._target!.hostname) ===
                    this.ns!.getServerMaxMoney(this._target!.hostname)
                ) {
                    this.stage = 2;
                } else {
                    return HackingUtilityFunctions.generateHackScriptPolicy(
                        this.ns!,
                        this._target!,
                        this.ramAllocation,
                        gwStructure,
                        HackingUtilityFunctions.getSequenceGW,
                    );
                }
            case 2:
                return HackingUtilityFunctions.generateHackScriptPolicy(
                    this.ns!,
                    this._target!,
                    this.ramAllocation,
                    hwgwStructure,
                    HackingUtilityFunctions.getSequenceHWGW,
                );
            default:
                throw new Error(`${this.stage}`);
        }
    }
}

class ExpEvaluator extends HackingEvaluator {
    public getPolicy(): HackingPolicy | undefined {
        if (!this._target) return;
        switch (this.stage) {
            case -1:
                return;
            case 0:
                if (
                    this.ns!.getServerSecurityLevel(this._target!.hostname) ===
                    this.ns!.getServerMinSecurityLevel(this._target!.hostname)
                ) {
                    this.stage = 1;
                } else {
                    return { target: this._target!, spacing: 0, sequence: [] };
                }
            case 1:
                return HackingUtilityFunctions.generateHackScriptPolicy(
                    this.ns!,
                    this._target!,
                    this.ramAllocation,
                    hwStructure,
                    HackingUtilityFunctions.getSequenceHW,
                );
            default:
                throw new Error(`${this.stage}`);
        }
    }
}

export class HackingUtilityModule extends BaseModule {
    /** Evaluator for hacking for money */
    moneyEvaluation: MoneyEvaluator = new MoneyEvaluator();
    /** Evaluator for hacking for exp */
    expEvaluation: ExpEvaluator = new ExpEvaluator();
    /** Amount of RAM to do sharing with */
    shareRam: number = 0;
    //stockEvaulation?: HackingEvaulation

    public init(ns: NS) {
        super.init(ns);

        this.moneyEvaluation.init(
            this.ns,
            (server: Server) => {
                const fakeServer = { ...server };
                fakeServer.hackDifficulty = fakeServer.minDifficulty;
                if (
                    server.hackDifficulty !== server.minDifficulty &&
                    fakeServer.hackDifficulty === server.hackDifficulty
                )
                    throw new Error('Copy error');
                const player = ns.getPlayer();
                const hackPercent = HackingUtilityFunctions.hackPercent(
                    this.ns,
                    fakeServer,
                    player,
                );
                const growPercent = HackingUtilityFunctions.growPercent(
                    this.ns,
                    fakeServer,
                    1,
                    player,
                );
                return (
                    (((HackingUtilityFunctions.hackChance(
                        this.ns,
                        fakeServer,
                        player,
                    ) *
                        hackPercent *
                        Math.log(growPercent)) /
                        Math.log(growPercent / (1 - hackPercent))) *
                        fakeServer.moneyMax!) /
                    HackingUtilityFunctions.hackTime(fakeServer, player)
                );
            },
            (server: Server) => 0,
        );
        this.expEvaluation.init(
            this.ns,
            (server: Server) => {
                const fakeServer = { ...server };
                fakeServer.hackDifficulty = fakeServer.minDifficulty;
                if (
                    server.hackDifficulty !== server.minDifficulty &&
                    fakeServer.hackDifficulty === server.hackDifficulty
                )
                    throw new Error('Copy error');
                const player = ns.getPlayer();
                return (
                    HackingUtilityFunctions.hackExp(
                        this.ns,
                        fakeServer,
                        player,
                    ) / HackingUtilityFunctions.hackTime(fakeServer, player)
                );
            },
            (server: Server) => 0,
        );
    }

    @BackgroundTask(60_000)
    /** Updates the list of money targets */
    moneyUpdate() {
        this.moneyEvaluation!.update();
    }
    @BackgroundTask(60_000)
    /** Updates the list of exp targets */
    expUpdate() {
        this.expEvaluation!.update();
    }

    @BackgroundTask(600_000)
    /** Updates the ram proportioning breakdown */
    decideRamProportioning() {
        if (this.shareRam === 0 && false) {
            this.moneyEvaluation!.ramAllocation =
                serverUtilityModule.totalServerRam * 0;
            this.expEvaluation!.ramAllocation =
                serverUtilityModule.totalServerRam * 0.8;
            this.shareRam = serverUtilityModule.totalServerRam; // * .2
        } else {
            this.moneyEvaluation!.ramAllocation =
                serverUtilityModule.totalServerRam * 0.6;
            this.expEvaluation!.ramAllocation =
                serverUtilityModule.totalServerRam * 0.2;
            this.shareRam = serverUtilityModule.totalServerRam; // * .2
        }
    }

    public log(): Record<string, any> {
        return {
            ...{ moneyEvaluation: this.moneyEvaluation.log() },
            ...{ expEvaluation: this.expEvaluation.log() },
            ...{
                moneyStage: this.moneyEvaluation!.stage,
                moneyTarget: this.moneyEvaluation!.target,
                moneyRam: this.moneyEvaluation!.ramAllocation,
                expStage: this.expEvaluation!.stage,
                expTarget: this.expEvaluation!.target,
                expRam: this.expEvaluation!.ramAllocation,
            },
        };
    }
}

/**
 * ### HackingUtilityModule Uniqueness
 * This module decides the hacking strategy
 */
export const hackingUtilityModule = new HackingUtilityModule();
state.push(hackingUtilityModule);
