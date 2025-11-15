import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import { GangModule } from 'gang/gangModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/** ### MoneyModule Uniqueness
 * Handles all purchasing decisions
 */
export class MoneyModule extends BaseModule {
    constructor(
        protected ns: NS,
        protected serverUtilityModule?: ServerUtilityModule,
        protected gangModule?: GangModule,
    ) {
        super(ns);
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'MoneyModule.purchaseServers',
                fn: this.purchaseServers.bind(this),
                nextRun: 0,
                interval: 60_000,
            },
            {
                name: 'MoneyModule.purchaseGangEquipment',
                fn: this.purchaseGangEquipment.bind(this),
                nextRun: 0,
                interval: 60_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    //Scuffed for now because w/e
    purchaseServers() {
        return;
        let [ramGained, cost] =
            this.serverUtilityModule!.cheapestPurchasableServer();
        while (this.ns.getPlayer().money > cost) {
            if (!this.serverUtilityModule!.purchaseServer()) {
                this.ns.tprint(
                    `Some dumb bug in MoneyModule player=${this.ns.getPlayer().money}, ${cost}, ${ramGained}`,
                );
                break;
            }
            [ramGained, cost] =
                this.serverUtilityModule!.cheapestPurchasableServer();
        }
    }
    //@BackgroundTask(60_000)
    //Scuffed for now because w/e
    purchaseGangEquipment() {
        let bestUpgrade = this.gangModule!.bestUpgrade;
        while (this.ns.getPlayer().money > bestUpgrade.cost) {
            if (
                !this.ns.gang.purchaseEquipment(
                    bestUpgrade.member,
                    bestUpgrade.name,
                )
            ) {
                this.ns.tprint(
                    `Some dumb bug in MoneyModule player=${this.ns.getPlayer().money}, ${JSON.stringify(bestUpgrade)}`,
                );
                break;
            }
            bestUpgrade = this.gangModule!.bestUpgrade;
        }
    }
}
