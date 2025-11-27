import { NS } from '@ns';

import { BladeburnerModule } from '/bladeburner/bladeburnerModule';

/**
 * Manages bladeburner
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const bladeburnerModule = new BladeburnerModule(ns);

    while (!ns.bladeburner.inBladeburner())
        if (!ns.bladeburner.joinBladeburnerDivision()) await ns.sleep(10_000);

    while (true) {
        bladeburnerModule.manage();
        bladeburnerModule.manage_sleeves();
        await ns.bladeburner.nextUpdate();
    }
}
