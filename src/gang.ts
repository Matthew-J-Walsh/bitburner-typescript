import { NS } from '@ns';

import { GangModule } from './gang/gangModule';

/**
 * Manages gangs
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const gangModule = new GangModule(ns);

    while (!ns.gang.inGang())
        if (!ns.gang.createGang('Slum Snakes')) await ns.sleep(10_000);

    while (true) {
        gangModule.manage();
        while (true) {
            const bestUpgrade = gangModule.bestUpgrade;
            if (bestUpgrade.cost < ns.getPlayer().money) {
                ns.gang.purchaseEquipment(bestUpgrade.member, bestUpgrade.name);
            } else {
                break;
            }
        }
        await ns.gang.nextUpdate();
    }
}
