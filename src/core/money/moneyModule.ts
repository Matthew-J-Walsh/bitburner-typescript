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
        while (this.ns.getPlayer().money > cost) {
            if (!serverUtilityModule.purchaseServer()) {
                this.ns.tprint('Some dumb bug in MoneyModule');
                break;
            }
            [ramGained, cost] = serverUtilityModule.cheapestPurchasableServer();
        }
    }
    //@BackgroundTask(60_000)
    //Scuffed for now because w/e
    purchaseGangStuff() {
        return;
    }
}

/** ### MoneyModule Uniqueness
 * Handles all purchasing decisions
 */
export const moneyModule = new MoneyModule();
state.push(moneyModule);
