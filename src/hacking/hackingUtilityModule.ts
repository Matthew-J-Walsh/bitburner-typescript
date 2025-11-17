import { NS, Server } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import {
    hwgwStructure,
    hwStructure,
    weakenFort,
    weakenScriptSize,
} from '/hacking/constants';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';
import { MoneyEvaluator, ExpEvaluator } from '/hacking/hackingEvaluator';
import { HackingUtilityHelpers } from '/hacking/hackingUtilityHelpers';
import { PurchaseEvaluation } from '/core/money/moneyModule';

/**
 * ### HackingUtilityModule Uniqueness
 * This module decides the hacking strategy
 */
export class HackingUtilityModule extends BaseModule {
    /** Evaluator for hacking for money */
    moneyEvaluation!: MoneyEvaluator;
    /** Evaluator for hacking for exp */
    expEvaluation!: ExpEvaluator;
    /** Amount of RAM to do sharing with */
    shareRam: number = 0;
    //stockEvaulation?: HackingEvaulation

    constructor(
        protected ns: NS,
        /** ServerUtilityModule instance */
        protected serverUtilityModule: ServerUtilityModule,
    ) {
        super(ns);

        this.moneyEvaluation = new MoneyEvaluator(
            this.ns,
            this.serverUtilityModule,
            (server: Server, ramAllocation: number) => {
                const fakeServer = { ...server };
                if (server.hackDifficulty !== server.minDifficulty)
                    ns.tprint(`Server disconnect: ${server}`);
                fakeServer.hackDifficulty = fakeServer.minDifficulty;
                if (
                    server.hackDifficulty !== server.minDifficulty &&
                    fakeServer.hackDifficulty === server.hackDifficulty
                )
                    throw new Error('Copy error');
                try {
                    return HackingUtilityHelpers.hackPolicyMoneyEval(
                        this.ns,
                        HackingUtilityHelpers.generateHackScriptPolicy(
                            this.ns,
                            server,
                            ramAllocation,
                            hwgwStructure,
                            HackingUtilityHelpers.getSequenceHWGW,
                        ),
                    );
                } catch (error) {
                    ns.tprint(`Evaluation failure on money ${error}`);
                    return -1;
                }
            },
            (server: Server, ramAllocation: number) => {
                //TODO: very arbitrary 4 * to guess grows
                return (
                    4 *
                    this.ns.formulas.hacking.weakenTime(
                        server,
                        this.ns.getPlayer(),
                    ) *
                    Math.ceil(
                        (((server.baseDifficulty! - server.minDifficulty!) /
                            weakenFort) *
                            weakenScriptSize) /
                            (ramAllocation + 0.01),
                    )
                );
            },
        );
        this.expEvaluation = new ExpEvaluator(
            this.ns,
            this.serverUtilityModule,
            (server: Server, ramAllocation: number) => {
                const fakeServer = { ...server };
                fakeServer.hackDifficulty = fakeServer.minDifficulty;
                if (
                    server.hackDifficulty !== server.minDifficulty &&
                    fakeServer.hackDifficulty === server.hackDifficulty
                )
                    throw new Error('Copy error');
                try {
                    //EXP evaluator must choose the worse when fighting with money
                    if (
                        server.hostname === this.moneyEvaluation.target.hostname
                    )
                        return -1;

                    return HackingUtilityHelpers.hackPolicyExpEval(
                        this.ns,
                        HackingUtilityHelpers.generateHackScriptPolicy(
                            this.ns,
                            server,
                            ramAllocation,
                            hwStructure,
                            HackingUtilityHelpers.getSequenceHW,
                        ),
                    );
                } catch (error) {
                    ns.tprint(`Evaluation failure on experience ${error}`);
                    return -1;
                }
            },
            (server: Server, ramAllocation: number) => {
                return (
                    this.ns.formulas.hacking.weakenTime(
                        server,
                        this.ns.getPlayer(),
                    ) *
                    Math.ceil(
                        (((server.baseDifficulty! - server.minDifficulty!) /
                            weakenFort) *
                            weakenScriptSize) /
                            (ramAllocation + 0.01),
                    )
                );
            },
        );
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'HackingUtilityModule.moneyUpdate',
                fn: this.moneyUpdate.bind(this),
                nextRun: Date.now() + 5_000,
                interval: 60_000,
            },
            {
                name: 'HackingUtilityModule.expUpdate',
                fn: this.expUpdate.bind(this),
                nextRun: Date.now() + 5_000,
                interval: 60_000,
            },
            {
                name: 'HackingUtilityModule.decideRamProportioning',
                fn: this.decideRamProportioning.bind(this),
                nextRun: 0,
                interval: 150_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    /** Updates the list of money targets */
    moneyUpdate() {
        this.moneyEvaluation.update();
    }
    /** Updates the list of exp targets */
    expUpdate() {
        this.expEvaluation.update();
    }

    /** Updates the ram proportioning breakdown */
    decideRamProportioning() {
        if (true) {
            //this.shareRam === 0 &&
            this.moneyEvaluation!.ramAllocation =
                this.serverUtilityModule.totalServerRam * 0;
            this.expEvaluation!.ramAllocation =
                this.serverUtilityModule.totalServerRam * 0.8;
            this.shareRam = this.serverUtilityModule.totalServerRam; // * .2
        } else {
            this.moneyEvaluation.ramAllocation =
                this.serverUtilityModule.totalServerRam * 0.8;
            this.expEvaluation.ramAllocation =
                this.serverUtilityModule.totalServerRam * 0;
            this.shareRam = this.serverUtilityModule.totalServerRam; // * .2
        }
    }

    /** How much money is made per second per 1 ram */
    private ramTimeIncome(): number {
        const policy = this.moneyEvaluation.getPolicy();
        if (!policy || this.moneyEvaluation.ramAllocation === 0) return 0;
        return (
            HackingUtilityHelpers.hackPolicyMoneyEval(this.ns, policy) /
            this.serverUtilityModule.totalServerRam
        );
    }

    /** Returns the evaluation of purchasing a server */
    public get serverPurchaseEvaluation(): PurchaseEvaluation {
        const [ram, cost] =
            this.serverUtilityModule.cheapestPurchasableServer();
        const income = ram * this.ramTimeIncome();
        return {
            income: income,
            cost: cost,
            buy: () => this.serverUtilityModule.purchaseServer(),
        };
    }

    public log(): Record<string, any> {
        return {
            ...{ moneyEvaluation: this.moneyEvaluation.log() },
            ...{ expEvaluation: this.expEvaluation.log() },
            ...{
                moneyTarget: this.moneyEvaluation.target,
                moneyRam: this.moneyEvaluation.ramAllocation,
                expTarget: this.expEvaluation.target,
                expRam: this.expEvaluation.ramAllocation,
            },
        };
    }
}
