import { NS, Server } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { serverUtilityModule } from '/hacking/serverUtilityModule';

/** Minimal time allowed between money batches targeting the same target */
const minimalTimeBetweenMoneyBatches = 2_000;
/** Minimal time allowed between experience batches targeting the same target */
const minimalTimeBetweenExpBatches = 500;

type MoneyBatchSequencing = [
    ['weaken', number],
    ['hack', number],
    ['weaken', number],
    ['grow', number],
];

type ExpBatchSequencing = [['weaken', number], ['hack', number]];

export type BatchScript = {
    script: 'hack' | 'grow' | 'weaken';
    threads: number;
};
export type BatchSequencing = {
    spacing: number;
    scripts: BatchScript[];
};

// Formulas should be free, change my mind
export class HackingUtilityFunctions {
    static growAmount(ns: NS, server: Server): number {}
    static growPercent(ns: NS, server: Server): number {}
    static growThreads(ns: NS, server: Server): number {}
    static hackChance(ns: NS, server: Server): number {}
    static hackExp(ns: NS, server: Server): number {}
    static hackPercent(ns: NS, server: Server): number {}

    /** Gets the time spacing and sequencing for stage 0 - pure weakening */
    static getStage0Distribution(
        ns: NS,
        server: Server,
        ramAllocation: number,
    ): [number, BatchScript] {}

    /** Gets the time spacing and sequencing for stage 0 - pure weakening */
    static getStage1Distribution(
        ns: NS,
        server: Server,
        ramAllocation: number,
    ): [number, BatchScript] {}

    /**
     * Caculates the time spacing between batches. Aims to maximize the number of batches.
     * Will avoid batch counts that are multiples of 4 (due to hack + weaken resonance)
     * Will avoid batch counts that are multiples of 5 (due to grow + weaken resonance)
     * @param weakenTime Time for a weaken
     * @returns The time spacing that should be maintained between batches and
     * the structure of the batches themselves
     */
    static getMoneyBatchSpacingAndDistribution(
        ns: NS,
        server: Server,
        ramAllocation: number,
    ): [number, MoneyBatchSequencing] {
        let maxBatches = Math.floor(
            weakenTime / minimalTimeBetweenMoneyBatches,
        );
        while (
            maxBatches > 0 &&
            (maxBatches % 4 === 0 || maxBatches % 5 === 0)
        ) {
            maxBatches--;
        }

        return [(weakenTime / maxBatches) * 1_000, []];
    }

    /**
     * Caculates the time spacing between batches. Aims to maximize the number of batches.
     * Will avoid batch counts that are multiples of 4 (due to hack + weaken resonance)
     * @param weakenTime Time for a weaken
     * @returns The time spacing that should be maintained between batches and
     * the structure of the batches themselves
     */
    static getExpBatchSpacingAndDistribution(
        ns: NS,
        target: Server,
        ramAllocation: number,
    ): [number, ExpBatchSequencing] {
        let maxBatches = Math.floor(weakenTime / minimalTimeBetweenExpBatches);
        while (maxBatches > 0 && maxBatches % 4 === 0) {
            maxBatches--;
        }

        return [(weakenTime / maxBatches) * 1_000, []];
    }
}

export class HackingUtilityModule extends BaseModule {
    /** Proportioning targets */
    ramProportioningTargets: { [key: string]: number } = {};

    //Map<string, number> = new Map<string, number>()

    /** Hacking money income estimates */
    hackIncomeEstimates: Array<number> = [];
    /** Hacking money startup cost estimates */
    hackMoneyCostEstimates: Array<number> = [];
    hackMoneyTarget: Server | null = null;
    hackMoneyBatchSpacing = 10_000;
    hackMoneyBatchSequencing: MoneyBatchSequencing = [
        ['weaken', 1],
        ['hack', 0],
        ['weaken', 0],
        ['grow', 0],
    ];

    /** Hacking experience income estimates */
    hackExpEstimates: Array<number> = [];
    /** Hacking experience startup cost estimates */
    hackExpCostEstimates: Array<number> = [];
    hackExpTarget: Server | null = null;
    hackExpBatchSpacing = 10_000;
    hackExpBatchSequencing: ExpBatchSequencing = [
        ['weaken', 1],
        ['hack', 0],
    ];

    /** Hacking stock income estimates */
    hackStockIncomeEstimates: Array<number> = [];
    /** Hacking stock startup cost estimates */
    hackStockCostEstimates: Array<number> = [];
    hackStockTarget: Server | null = null;
    hackStockBatchSpacing = 10_000;
    //hackStockBatchSequencing: BatchSequencing

    //Might not need
    private mapOverServers(
        fn: (server: Server) => number,
    ): Map<string, number> {
        return new Map(
            serverUtilityModule.targetableServers.map((server) => [
                server.hostname,
                fn(server),
            ]),
        );
    }

    private iterateOverServers(fn: (server: Server) => number): Array<number> {
        return serverUtilityModule.targetableServers.map((server) =>
            fn(server),
        );
    }

    @BackgroundTask(60_000)
    /** Updates the list of money hacking targets */
    moneyHackingTargets() {
        this.moneyHackingIncome();
        this.moneyHackingStartupCost();
        this.decideMoneyHacking();
    }
    /** Updates the list of money hacking income estimates */
    moneyHackingIncome = () =>
        (this.hackIncomeEstimates = this.iterateOverServers(
            (server: Server) => {
                return (
                    (HackingUtilityFunctions.hackChance(this.ns, server) *
                        HackingUtilityFunctions.hackPercent(this.ns, server) *
                        server.moneyMax!) /
                    this.ns.getHackTime(server.hostname)
                );
            },
        ));
    /** Updates the list of money hacking startup cost estimates */
    moneyHackingStartupCost() {}
    /** Updates the money hacking controls */
    decideMoneyHacking() {
        const ramAllocation =
            serverUtilityModule.totalServerRam() *
            (this.ramProportioningTargets.money ?? 0);
        var result = this.hackIncomeEstimates.reduce(
            (best, val, idx) =>
                val > best.value ? { value: val, index: idx } : best,
            { value: this.hackIncomeEstimates[0], index: 0 },
        );
        this.hackMoneyTarget =
            serverUtilityModule.targetableServers[result.index];
        [this.hackMoneyBatchSpacing, this.hackMoneyBatchSequencing] =
            HackingUtilityFunctions.getMoneyBatchSpacingAndDistribution(
                this.hackMoneyTarget,
                ramAllocation,
            );
    }

    @BackgroundTask(60_000)
    /** Updates the list of experience hacking targets */
    expHackingTargets() {
        this.expHackingIncome();
        this.expHackingStartupCost();
        this.decideExpHacking();
    }
    /** Updates the list of experience hacking income estimates */
    expHackingIncome = () =>
        (this.hackExpEstimates = this.iterateOverServers((server: Server) => {
            return (
                (HackingUtilityFunctions.hackChance(this.ns, server) *
                    HackingUtilityFunctions.hackExp(this.ns, server)) /
                this.ns.getHackTime(server.hostname)
            );
        }));
    /** Updates the list of experience hacking startup cost estimates */
    expHackingStartupCost() {}
    /** Updates the experience hacking controls */
    decideExpHacking() {
        const ramAllocation =
            serverUtilityModule.totalServerRam() *
            (this.ramProportioningTargets.exp ?? 0);
        var result = this.hackExpEstimates.reduce(
            (best, val, idx) =>
                val > best.value ? { value: val, index: idx } : best,
            { value: this.hackExpEstimates[0], index: 0 },
        );
        this.hackExpTarget =
            serverUtilityModule.targetableServers[result.index];
        [this.hackExpBatchSpacing, this.hackExpBatchSequencing] =
            HackingUtilityFunctions.getExpBatchSpacingAndDistribution(
                this.hackExpTarget,
                ramAllocation,
            );
    }

    /** Updates the list of stock hacking targets */
    stockHackingTargets() {
        this.stockHackingIncome();
        this.stockHackingStartupCost();
    }
    /** Updates the list of stock hacking income estimates */
    stockHackingIncome() {}
    /** Updates the list of stock hacking startup cost estimates */
    stockHackingStartupCost() {}
    /** Updates the stock hacking controls */
    decideStockHacking() {}

    @BackgroundTask(120_000)
    /** Updates the ram proportioning breakdown */
    decideRamProportioning() {
        if (this.ramProportioningTargets.length === 0) {
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
