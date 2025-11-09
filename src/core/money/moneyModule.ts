import { NS } from '@ns';
import {
    TrackProperty,
    BackgroundTask,
    PriorityTask,
} from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';
import { serverUtilityModule } from '/hacking/serverUtilityModule';

export class MoneyModule extends BaseModule {
    @BackgroundTask(60_000)
    //Scuffed for now because w/e
    purchaseServers() {
        let [ramGained, cost] = serverUtilityModule.cheapestPurchasableServer();
        return;
        while (this.ns.getPlayer().money > cost) {
            serverUtilityModule.purchaseServer();
            [ramGained, cost] = serverUtilityModule.cheapestPurchasableServer();
        }
    }
}

/** ### MoneyModule Uniqueness
 * Handles all purchasing decisions
 */
export const moneyModule = new MoneyModule();
state.push(moneyModule);
