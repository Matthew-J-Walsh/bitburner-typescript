import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { HackingUtilityModule } from '/hacking/hackingUtilityModule';
import { GangModule } from 'gang/gangModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/** Type for everything that wants to get bought */
export type PurchaseEvaluation = {
    /** Bonus income in money per second */
    income: number;
    /** Instantaneous cost */
    cost: number;
    /** Purchase function to use */
    buy: () => boolean;
};

/** ### MoneyModule Uniqueness
 * Handles all purchasing decisions
 */
export class MoneyModule extends BaseModule {
    constructor(
        protected ns: NS,
        protected hackingUtilityModule?: HackingUtilityModule,
        protected gangModule?: GangModule,
    ) {
        super(ns);
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'MoneyModule.processPurchases',
                fn: this.processPurchases.bind(this),
                nextRun: 0,
                interval: 10_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    public processPurchases() {
        if (this.gangModule && this.gangModule.stage === 0) {
            let purchase = this.gangModule.bestUpgradeExternal;
            while (purchase.cost < this.ns.getPlayer().money) {
                if (!purchase.buy()) {
                    this.ns.tprint(
                        `Some dumb bug in MoneyModule money=${this.ns.getPlayer().money} target=${JSON.stringify(purchase)}`,
                    );
                    break;
                }
                purchase = this.gangModule.bestUpgradeExternal;
            }
            return;
        }

        let i = 0;
        while (i < 1000) {
            i += 1;

            const purchases = this.getPurchases;
            const evaluatorFunction = this.getPurchaseEvaluator;
            const evaluations = purchases.map(
                (purchase: PurchaseEvaluation) => {
                    return {
                        evaluation: evaluatorFunction(purchase),
                        purchase: purchase,
                    };
                },
            );

            const best = evaluations.reduce(
                (best, val) => (val.evaluation > best.evaluation ? val : best),
                evaluations[0],
            );
            if (best.purchase.cost < this.ns.getPlayer().money) {
                if (!best.purchase.buy()) {
                    this.ns.tprint(
                        `Some dumb bug in MoneyModule money=${this.ns.getPlayer().money} target=${JSON.stringify(best)}`,
                    );
                    break;
                }
            } else {
                break;
            }
        }
        if (i === 1000)
            this.ns.tprint(`i blocked an infinite loop in processPurchases`);
    }

    //TODO: Register purchase
    private get getPurchases(): PurchaseEvaluation[] {
        const purchases: PurchaseEvaluation[] = [];
        if (this.gangModule)
            purchases.push(this.gangModule.bestUpgradeExternal);
        if (this.hackingUtilityModule)
            purchases.push(this.hackingUtilityModule.serverPurchaseEvaluation);
        return purchases;
    }

    private get getPurchaseEvaluator(): (
        purchase: PurchaseEvaluation,
    ) => number {
        return this.getPurchaseEvaluatorMoneyGoal;
    }

    /**
     * When we have a money goal the value to maximize and garentee is > 0 is:
     * R = Remaining = Goal - Current
     * I = Current income
     * a = Additional income from purchase
     * c = Cost of purchase
     * R/I - R/(I+a) + c/I
     */
    private get getPurchaseEvaluatorMoneyGoal(): (
        purchase: PurchaseEvaluation,
    ) => number {
        const moneyGoal = 1e11; //Singularity
        const current = this.ns.getPlayer().money;
        const remaining = Math.max(moneyGoal - current, 0);
        const currentIncome = 1e8; //Singularity
        return (purchase: PurchaseEvaluation) =>
            remaining / currentIncome -
            (moneyGoal - Math.min(purchase.cost, current)) /
                (currentIncome + purchase.income) +
            Math.max(0, purchase.cost - current) / currentIncome;
    }

    /**
     * When we have another goal the value to maximize and garentee is > 0 is:
     * T = Time remaining
     * I = Current income
     * a = Additional income from purchase
     * c = Cost of purchase
     * a * (T - c/I)
     */
    private get getPurchaseEvaluatorOtherGoal(): (
        purchase: PurchaseEvaluation,
    ) => number {
        const timeRemaining = 10_000; //Singularity
        const currentIncome = 1e8; //Singularity
        return (purchase: PurchaseEvaluation) =>
            purchase.income * (timeRemaining - purchase.cost / currentIncome);
    }
}
