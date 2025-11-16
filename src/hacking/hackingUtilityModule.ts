import { NS, Server } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import {
    hwgwStructure,
    hwStructure,
    hackScriptSize,
    growScriptSize,
    weakenScriptSize,
} from '/hacking/constants';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';
import { MoneyEvaluator, ExpEvaluator } from '/hacking/hackingEvaluator';
import { HackingUtilityHelpers } from './hackingUtilityHelpers';

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
        protected serverUtilityModule: ServerUtilityModule,
    ) {
        super(ns);

        this.moneyEvaluation = new MoneyEvaluator(
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
                    //fix me lamo
                    return -1;
                }
            },
            (server: Server, ramAllocation: number) => 0,
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
            },
            (server: Server, ramAllocation: number) => 0,
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

    public log(): Record<string, any> {
        return {
            ...{ moneyEvaluation: this.moneyEvaluation.log() },
            ...{ expEvaluation: this.expEvaluation.log() },
            ...{
                moneyStage: this.moneyEvaluation.stage,
                moneyTarget: this.moneyEvaluation.target,
                moneyRam: this.moneyEvaluation.ramAllocation,
                expStage: this.expEvaluation.stage,
                expTarget: this.expEvaluation.target,
                expRam: this.expEvaluation.ramAllocation,
            },
        };
    }
}
