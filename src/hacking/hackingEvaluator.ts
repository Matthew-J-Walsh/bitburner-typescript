import { Server, NS } from '@ns';
import {
    hwgwStructure,
    gwStructure,
    hwStructure,
    HackingPolicy,
} from '/hacking/constants';
import { HackingUtilityHelpers } from './hackingUtilityHelpers';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';

export abstract class HackingEvaluator {
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

    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
        protected incomeFormula: (
            server: Server,
            ramAllocation: number,
        ) => number,
        protected costFormula: (
            server: Server,
            ramAllocation: number,
        ) => number,
    ) {
        this.ns = ns;
        this.incomeFormula = incomeFormula;
        this.costFormula = costFormula;
    }

    protected iterateOverServers<T>(
        fn: (server: Server, ramAllocation: number) => T,
    ): Array<T> {
        return this.serverUtilityModule.targetableServers.map((server) =>
            fn(server, this.ramAllocation),
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
                this.serverUtilityModule.targetableServers[best.index].hostname
        ) {
            this.stage = 0;
        }
        this._target = this.serverUtilityModule.targetableServers[best.index];
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
        if (!this._target) return {};
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
            best: this.serverUtilityModule.targetableServers[topTwo.best.index],
            bestValue: topTwo.best.value,
            hghwBatches: HackingUtilityHelpers.getBatches(
                this.ns!.getWeakenTime(
                    this.serverUtilityModule.targetableServers[
                        topTwo.best.index
                    ].hostname,
                ),
                hwgwStructure,
                this.ramAllocation,
            ),
            second: this.serverUtilityModule.targetableServers[
                topTwo.second.index
            ],
            secondValue: topTwo.second.value,
        };
    }
}
export class MoneyEvaluator extends HackingEvaluator {
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
                    return HackingUtilityHelpers.generateHackScriptPolicy(
                        this.ns!,
                        this._target!,
                        this.ramAllocation,
                        gwStructure,
                        HackingUtilityHelpers.getSequenceGW,
                    );
                }
            case 2:
                return HackingUtilityHelpers.generateHackScriptPolicy(
                    this.ns!,
                    this._target!,
                    this.ramAllocation,
                    hwgwStructure,
                    HackingUtilityHelpers.getSequenceHWGW,
                );
            default:
                throw new Error(`${this.stage}`);
        }
    }
}
export class ExpEvaluator extends HackingEvaluator {
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
                return HackingUtilityHelpers.generateHackScriptPolicy(
                    this.ns!,
                    this._target!,
                    this.ramAllocation,
                    hwStructure,
                    HackingUtilityHelpers.getSequenceHW,
                );
            default:
                throw new Error(`${this.stage}`);
        }
    }
}
