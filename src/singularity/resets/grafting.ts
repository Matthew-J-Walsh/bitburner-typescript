import { NS } from '@ns';
import { defaultSleepTime, startUpScript } from '../constants';

export async function graftingReset(ns: NS, augName: string) {
    while (
        ns.grafting.getAugmentationGraftPrice(augName) > ns.getPlayer().money
    ) {
        ns.alert(
            "WARNING WE DON'T HAVE ENOUGH MONEY FOR GRAFTING AN AUG, SOMETHING GOT BIG FUCKED!",
        );
        await ns.sleep(120_000);
    }
    ns.grafting.graftAugmentation(augName);
    await ns.grafting.waitForOngoingGrafting();
    ns.singularity.softReset(startUpScript);
}

export async function partialGraftingReset(ns: NS, augName: string) {
    while (
        ns.grafting.getAugmentationGraftPrice(augName) > ns.getPlayer().money
    ) {
        ns.singularity.universityCourse(
            'ZB Institute of Technology',
            'Algorithms',
        );
        await ns.sleep(defaultSleepTime);
    }
    ns.grafting.graftAugmentation(augName);
    await ns.grafting.waitForOngoingGrafting();
}

async function qLinkPartialReset(ns: NS) {
    while (
        ns.grafting.getAugmentationGraftPrice('QLink') > ns.getPlayer().money
    ) {
        ns.singularity.universityCourse(
            'ZB Institute of Technology',
            'Algorithms',
        );
        await ns.sleep(defaultSleepTime);
    }
    ns.grafting.graftAugmentation('QLink');
    await ns.grafting.waitForOngoingGrafting();
}

async function congruityPartialReset(ns: NS) {
    while (
        ns.grafting.getAugmentationGraftPrice('violet Congruity Implant') >
        ns.getPlayer().money
    ) {
        ns.singularity.universityCourse(
            'ZB Institute of Technology',
            'Algorithms',
        );
        await ns.sleep(defaultSleepTime);
    }
    ns.grafting.graftAugmentation('violet Congruity Implant');
    await ns.grafting.waitForOngoingGrafting();
}
