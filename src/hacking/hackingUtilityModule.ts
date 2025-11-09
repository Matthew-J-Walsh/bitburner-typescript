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
} from '/hacking/constants';

const hackScriptSize = 1.7;
const growScriptSize = 1.75;
const weakenScriptSize = 1.75;
const weakenRatio = 1.0 / 26.0;

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

    private static calculateServerGrowthLog(
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
            this.calculateServerGrowthLog(ns, server, threads, player, cores),
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

        const k = this.calculateServerGrowthLog(ns, server, 1, player, cores);

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

    /**
     * Get the number of batches to aim for
     * @param weakenTime Weaken time (one full cycle time)
     * @param structure Structure being used
     * @returns Number of batches to aim for
     */
    protected static getBatches(
        weakenTime: number,
        structure: HackScriptType[],
    ): number {
        let maxBatches = Math.floor(
            weakenTime / (structure.length - 1) / minimalTimeBetweenPerPair,
        );
        maxBatches = Math.min(maxBatches, 51);
        while (
            maxBatches > 0 &&
            ((maxBatches % 4 === 0 && 'grow' in structure) ||
                (maxBatches % 5 === 0 && 'hack' in structure))
        ) {
            maxBatches--;
        }

        return maxBatches;
    }

    protected static getSequenceInitailizer(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): [number, number, number, number] {
        const player = ns.getPlayer();
        const ramPerBatch = ramAllocation / batches;
        const totalWeakenCount = Math.ceil(
            (ramPerBatch / weakenScriptSize) * weakenRatio + 2,
        );
        const hackPercent = HackingUtilityFunctions.hackPercent(
            ns,
            target,
            player,
        );
        const growPercent = HackingUtilityFunctions.growPercent(
            ns,
            target,
            1,
            player,
        );
        return [ramPerBatch, totalWeakenCount, hackPercent, growPercent];
    }

    /**
     * Gets the approximation for sequencing a hack-weaken-grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    protected static getSequenceHWGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        const [ramPerBatch, totalWeakenCount, hackPercent, growPercent] =
            this.getSequenceInitailizer(ns, target, batches, ramAllocation);

        let hackCount =
            (Math.floor(
                (ramPerBatch - totalWeakenCount * weakenScriptSize) /
                    growScriptSize,
            ) *
                Math.log(growPercent)) /
            (Math.log(growPercent) - Math.log(hackPercent));
        let growCount = Math.floor(
            (ramPerBatch -
                totalWeakenCount * weakenScriptSize +
                hackCount * hackScriptSize) /
                growScriptSize,
        );
        let totalMulti =
            Math.pow(hackPercent, hackCount) * Math.pow(growPercent, growCount);
        let extraRam =
            ramPerBatch -
            totalWeakenCount * weakenScriptSize -
            hackCount * hackScriptSize -
            growCount * weakenScriptSize;
        let hackWeakens = Math.ceil(hackCount * weakenRatio);
        let growWeakens = Math.ceil(growCount * weakenRatio);
        if (
            totalMulti < 1 ||
            extraRam < 0 ||
            hackWeakens + growWeakens > totalWeakenCount
        ) {
            ns.tprint('Super fatal error in getSequence()');
        }
        // TODO: Maybe we can make a better approx? this should be close.
        return [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: hackWeakens },
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: growWeakens },
        ];
    }

    /**
     * Gets the approximation for sequencing a hack-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    protected static getSequenceHW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        const [ramPerBatch, totalWeakenCount, hackPercent, growPercent] =
            this.getSequenceInitailizer(ns, target, batches, ramAllocation);

        let hackCount = Math.floor(
            (ramPerBatch - totalWeakenCount * weakenScriptSize) /
                hackScriptSize,
        );
        return [
            { script: 'hack', threads: hackCount },
            { script: 'weaken', threads: totalWeakenCount },
        ];
    }

    /**
     * Gets the approximation for sequencing a grow-weaken, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    protected static getSequenceGW(
        ns: NS,
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        const [ramPerBatch, totalWeakenCount, hackPercent, growPercent] =
            this.getSequenceInitailizer(ns, target, batches, ramAllocation);

        let growCount = Math.floor(
            (ramPerBatch - totalWeakenCount * weakenScriptSize) /
                growScriptSize,
        );
        return [
            { script: 'grow', threads: growCount },
            { script: 'weaken', threads: totalWeakenCount },
        ];
    }

    /** Get the policy for this evaluator at the moment */
    public abstract getPolicy(): HackingPolicy | undefined;
}

class MoneyEvaluator extends HackingEvaluator {
    public getPolicy(): HackingPolicy | undefined {
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
                    const weakenTime = this.ns!.getWeakenTime(
                        this._target!.hostname,
                    );
                    const batches = HackingEvaluator.getBatches(
                        weakenTime,
                        gwStructure,
                    );
                    return {
                        target: this._target!,
                        spacing: weakenTime / batches,
                        sequence: HackingEvaluator.getSequenceGW(
                            this.ns!,
                            this._target!,
                            batches,
                            this.ramAllocation,
                        ),
                    };
                }
            case 2:
                const weakenTime = this.ns!.getWeakenTime(
                    this._target!.hostname,
                );
                const batches = HackingEvaluator.getBatches(
                    weakenTime,
                    hwgwStructure,
                );
                return {
                    target: this._target!,
                    spacing: weakenTime / batches,
                    sequence: HackingEvaluator.getSequenceHWGW(
                        this.ns!,
                        this._target!,
                        batches,
                        this.ramAllocation,
                    ),
                };
            default:
                throw new Error(`${this.stage}`);
        }
    }
}

class ExpEvaluator extends HackingEvaluator {
    public getPolicy(): HackingPolicy | undefined {
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
                const weakenTime = this.ns!.getWeakenTime(
                    this._target!.hostname,
                );
                const batches = HackingEvaluator.getBatches(
                    weakenTime,
                    hwStructure,
                );
                return {
                    target: this._target!,
                    spacing: weakenTime / batches,
                    sequence: HackingEvaluator.getSequenceHW(
                        this.ns!,
                        this._target!,
                        batches,
                        this.ramAllocation,
                    ),
                };
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

    init(ns: NS) {
        super.init(ns);

        this.moneyEvaluation.init(
            this.ns,
            (server: Server) => {
                // TODO: Make this evaulation take into account grow costs
                const player = ns.getPlayer();
                return (
                    (HackingUtilityFunctions.hackChance(
                        this.ns,
                        server,
                        player,
                    ) *
                        HackingUtilityFunctions.hackPercent(
                            this.ns,
                            server,
                            player,
                        ) *
                        server.moneyMax!) /
                    this.ns.getHackTime(server.hostname)
                );
            },
            (server: Server) => 0,
        );
        this.expEvaluation.init(
            this.ns,
            (server: Server) => {
                const player = ns.getPlayer();
                return (
                    (HackingUtilityFunctions.hackChance(
                        this.ns,
                        server,
                        player,
                    ) *
                        HackingUtilityFunctions.hackPercent(
                            this.ns,
                            server,
                            player,
                        ) *
                        server.moneyMax!) /
                    this.ns.getHackTime(server.hostname)
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

    @BackgroundTask(120_000)
    /** Updates the ram proportioning breakdown */
    decideRamProportioning() {
        if (this.shareRam === 0) {
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
}

/**
 * ### HackingUtilityModule Uniqueness
 * This module decides the hacking strategy
 */
export const hackingUtilityModule = new HackingUtilityModule();
state.push(hackingUtilityModule);
