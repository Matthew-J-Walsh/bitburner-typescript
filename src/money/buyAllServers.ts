import { NS } from '@ns';
import { ServerMoneyUtils } from './serverUtils';

/**
 * Buys all purchasable servers possible
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    ServerMoneyUtils.purchaseServers(ns, ns.getPlayer().money);
}
