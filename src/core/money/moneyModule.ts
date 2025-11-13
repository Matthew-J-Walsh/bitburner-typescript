import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { ServerUtilityModule } from '/hacking/serverUtilityModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/** ### MoneyModule Uniqueness
 * Handles all purchasing decisions
 */
export class MoneyModule extends BaseModule {
    constructor(
        protected ns: NS,
        protected serverUtilityModule: ServerUtilityModule,
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
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [];
    }

    //Scuffed for now because w/e
    purchaseServers() {
        return;
        let [ramGained, cost] =
            this.serverUtilityModule.cheapestPurchasableServer();
        while (this.ns.getPlayer().money > cost) {
            if (!this.serverUtilityModule.purchaseServer()) {
                this.ns.tprint(
                    `Some dumb bug in MoneyModule player=${this.ns.getPlayer().money}, ${cost}, ${ramGained}`,
                );
                break;
            }
            [ramGained, cost] =
                this.serverUtilityModule.cheapestPurchasableServer();
        }
    }
    //@BackgroundTask(60_000)
    //Scuffed for now because w/e
    purchaseGangStuff() {
        return;
    }
}
