import { NS, Player, Server } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { serverUtilityModule } from '/hacking/serverUtilityModule';
import {
    minimalTimeBetweenPerPair,
    HackScriptType,
    HackingScript,
    growStructure,
    moneyStructure,
    expStructure,
} from '/hacking/constants';

const hackScriptSize = 1.7;
const growScriptSize = 1.75;
const weakenScriptSize = 1.75;
const weakenRatio = 1.0 / 26.0;

export type HackingPolicy = {
    target: Server;
    spacing: number;
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

/** An evaluator for a hacking decisions */
export class HackingEvaluator {
    /** Estimated incomes of the different server options */
    incomeEstimates: Array<number> = [];
    /** Estimated change costs of the different server options */
    costEstimates: Array<number> = [];

    constructor(
        private ns: NS,
        private incomeFormula: (server: Server) => number,
        private costFormula: (server: Server) => number,
        private structure: HackScriptType[],
    ) {}

    private iterateOverServers(fn: (server: Server) => number): Array<number> {
        return serverUtilityModule.targetableServers.map((server) =>
            fn(server),
        );
    }

    /** Updates current evaluations */
    public update() {
        this.updateIncomeEstimates();
        this.updateCostEstimates();
    }

    /** Updates the income estimates */
    public updateIncomeEstimates() {
        this.incomeEstimates = this.iterateOverServers(this.incomeFormula);
    }

    /** Updates the cost estimates */
    public updateCostEstimates() {
        this.costEstimates = this.iterateOverServers(this.costFormula);
    }

    /** Gets the current target that the evaluator says is best */
    public getTarget(): Server {
        const best = this.incomeEstimates.reduce(
            (best, val, idx) =>
                val > best.value ? { value: val, index: idx } : best,
            { value: this.incomeEstimates[0], index: 0 },
        );
        return serverUtilityModule.targetableServers[best.index];
    }

    /**
     * Get the policy the evaluator says is best
     * @param ramAllocation Amount of ram to allocate to this
     * @returns The new policy
     */
    public updatePolicy(ramAllocation: number): HackingPolicy {
        return this.getPolicy(ramAllocation, this.getTarget());
    }

    /**
     * Get the number of batches to aim for
     * @param weakenTime Weaken time (one full cycle time)
     * @returns Number of batches to aim for
     */
    public getBatches(weakenTime: number): number {
        let maxBatches = Math.floor(
            weakenTime /
                (this.structure.length - 1) /
                minimalTimeBetweenPerPair,
        );
        maxBatches = Math.min(maxBatches, 51);
        while (
            maxBatches > 0 &&
            ((maxBatches % 4 === 0 && 'grow' in this.structure) ||
                (maxBatches % 5 === 0 && 'hack' in this.structure))
        ) {
            maxBatches--;
        }

        return maxBatches;
    }

    /**
     * Gets the approximation for sequencing, should be safe
     * @param target target server
     * @param batches number of batches
     * @param ramAllocation total amount of ram to use
     * @returns
     */
    public getSequence(
        target: Server,
        batches: number,
        ramAllocation: number,
    ): HackingScript[] {
        const player = this.ns.getPlayer();
        const ramPerBatch = ramAllocation / batches;
        const totalWeakenCount = Math.ceil(
            (ramPerBatch / weakenScriptSize) * weakenRatio + 2,
        );
        const hackPercent = HackingUtilityFunctions.hackPercent(
            this.ns,
            target,
            player,
        );
        const growPercent = HackingUtilityFunctions.growPercent(
            this.ns,
            target,
            1,
            player,
        );
        if ('hack' in this.structure && 'grow' in this.structure) {
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
                Math.pow(hackPercent, hackCount) *
                Math.pow(growPercent, growCount);
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
                this.ns.tprint('Super fatal error in getSequence()');
            }
            // TODO: Maybe we can make a better approx? this should be close.
            return [
                { script: 'hack', threads: hackCount },
                { script: 'weaken', threads: hackWeakens },
                { script: 'grow', threads: growCount },
                { script: 'weaken', threads: growWeakens },
            ];
        } else if ('hack' in this.structure) {
            let hackCount = Math.floor(
                (ramPerBatch - totalWeakenCount * weakenScriptSize) /
                    hackScriptSize,
            );
            return [
                { script: 'hack', threads: hackCount },
                { script: 'weaken', threads: totalWeakenCount },
            ];
        } else {
            let growCount = Math.floor(
                (ramPerBatch - totalWeakenCount * weakenScriptSize) /
                    growScriptSize,
            );
            return [
                { script: 'grow', threads: growCount },
                { script: 'weaken', threads: totalWeakenCount },
            ];
        }
    }

    /**
     * Get the policy the evaluator says is best for a target, semi-static
     * @param ramAllocation Amount of ram to allocate to this
     * @param target target server
     * @returns The new policy
     */
    public getPolicy(ramAllocation: number, target: Server): HackingPolicy {
        const weakenTime = this.ns.getWeakenTime(target.hostname);
        const batches = this.getBatches(weakenTime);
        const sequence = this.getSequence(target, batches, ramAllocation);
        return {
            target: target,
            spacing: weakenTime / batches,
            sequence: sequence,
        };
    }
}

export class HackingUtilityModule extends BaseModule {
    /** How our ram should be partitioned by decimal */
    ramProportioningTargets?: { money: number; exp: number; share: number };

    /** Evaluator for growing */
    growEvaluation?: HackingEvaluator;
    /** Evaluator for hacking for money */
    moneyEvaluation?: HackingEvaluator;
    /** Evaluator for hacking for exp */
    expEvaluation?: HackingEvaluator;
    //stockEvaulation?: HackingEvaulation

    init(ns: NS) {
        super.init(ns);

        this.growEvaluation = new HackingEvaluator(
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
            growStructure,
        );
        this.moneyEvaluation = new HackingEvaluator(
            this.ns,
            (server: Server) => 0,
            (server: Server) => 0,
            moneyStructure,
        );
        this.expEvaluation = new HackingEvaluator(
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
            expStructure,
        );
    }

    @BackgroundTask(60_000)
    /** Updates the list of growing targets */
    growUpdate() {
        this.growEvaluation!.update();
    }
    @BackgroundTask(60_000)
    /** Updates the list of growing targets */
    expUpdate() {
        this.expEvaluation!.update();
    }

    @BackgroundTask(120_000)
    /** Updates the ram proportioning breakdown */
    decideRamProportioning() {
        if (!this.ramProportioningTargets) {
            this.ramProportioningTargets = { money: 0, exp: 0.8, share: 0.2 };
        } else {
            this.ramProportioningTargets = { money: 0.6, exp: 0.2, share: 0.2 };
        }
    }
}

/**
 * ### HackingUtilityModule Uniqueness
 * This module decides the hacking strategy
 */
export const hackingUtilityModule = new HackingUtilityModule();
state.push(hackingUtilityModule);
