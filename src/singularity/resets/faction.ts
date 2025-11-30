import { FactionName, FactionWorkType, NS } from '@ns';
import { FactionFunctions } from '../utils/faction';
import { AugmentationFunctions } from '../utils/augments';
import { defaultSleepTime, startUpScript } from '../constants';
import { CrimeFunctions } from '../utils/crime';
import { FactionReset } from '../constants';

export type ValidHackingResets =
    | 'Tian Di Hui'
    | 'CSEC'
    | 'NiteSec'
    | 'Bitrunners 1'
    | 'Bitrunners 2'
    | 'Bitrunners 3'
    | 'Bitrunners 4'
    | 'Daedalus 1'
    | 'Daedalus 2'
    | 'Daedalus 3'
    | 'Daedalus 4';

export const HackingResetFactionTable: Record<
    ValidHackingResets,
    FactionReset
> = {
    'Tian Di Hui': {
        type: 'faction',
        faction: FactionName.TianDiHui,
        augments: [
            'Social Negotiation Assistant (S.N.A)',
            'ADR-V1 Pheromone Gene',
            'Nuoptimal Nootropic Injector Implant',
            'Speech Enhancement',
            'Wired Reflexes',
            'Speech Processor Implant',
        ],
        favor: 0,
    },
    CSEC: {
        type: 'faction',
        faction: FactionName.CyberSec,
        augments: [
            'Cranial Signal Processors - Gen I',
            'Cranial Signal Processors - Gen II',
            'BitWire',
            'Synaptic Enhancement Implant',
            'Neurotrainer I',
        ],
        favor: 0,
    },
    NiteSec: {
        type: 'faction',
        faction: FactionName.NiteSec,
        augments: [
            'Cranial Signal Processors - Gen III',
            'DataJack',
            'Embedded Netburner Module',
            'Neural-Retention Enhancement',
            'Embedded Netburner Module',
            'CRTX42-AA Gene Modification',
            'Artificial Synaptic Potentiation',
            'Neurotrainer II',
        ],
        favor: 0,
    },
    'Bitrunners 1': {
        type: 'faction',
        faction: FactionName.BitRunners,
        augments: [],
        favor: 56,
    },
    'Bitrunners 2': {
        type: 'faction',
        faction: FactionName.BitRunners,
        augments: [
            'Enhanced Myelin Sheathing',
            'Cranial Signal Processors - Gen IV',
        ],
        favor: 110,
    },
    'Bitrunners 3': {
        type: 'faction',
        faction: FactionName.BitRunners,
        augments: [
            'Artificial Bio-neural Network Implant',
            'Embedded Netburner Module Core Implant',
            'Cranial Signal Processors - Gen V',
            'Neural Accelerator',
        ],
        favor: 150,
    },
    'Bitrunners 4': {
        type: 'faction',
        faction: FactionName.BitRunners,
        augments: [
            'BitRunners Neurolink',
            'Embedded Netburner Module Core V2 Upgrade',
        ],
        favor: 0,
    },
    'Daedalus 1': {
        type: 'faction',
        faction: FactionName.Daedalus,
        augments: [],
        favor: 56,
    },
    'Daedalus 2': {
        type: 'faction',
        faction: FactionName.Daedalus,
        augments: [],
        favor: 110,
    },
    'Daedalus 3': {
        type: 'faction',
        faction: FactionName.Daedalus,
        augments: [],
        favor: 150,
    },
    'Daedalus 4': {
        type: 'faction',
        faction: FactionName.Daedalus,
        augments: [
            'Embedded Netburner Module Core V3 Upgrade',
            'Embedded Netburner Module Analyze Engine',
            'The Red Pill',
        ],
        favor: 0,
    },
};

export async function factionReset(
    ns: NS,
    factionName: FactionName,
    augNames: string[],
    favor: number,
    skipReset = false,
) {
    while (!FactionFunctions.inFaction(ns, factionName)) {
        if (FactionFunctions.invitedToFaction(ns, factionName)) {
            ns.singularity.joinFaction(factionName);
        } else {
            ns.singularity.universityCourse(
                'ZB Institute of Technology',
                'Algorithms',
            );
            await ns.sleep(defaultSleepTime);
        }
    }

    const repTarget = AugmentationFunctions.maxRepRequirement(ns, augNames);
    const [purchaseOrder, moneyCost] =
        AugmentationFunctions.augmentPurchaseOrder(ns, augNames);

    while (
        !FactionFunctions.aboveFactionRep(ns, factionName, repTarget) &&
        !FactionFunctions.aboveFactionFavor(ns, factionName, favor)
    ) {
        //ns.singularity.donateToFaction(factionName, )
        ns.singularity.workForFaction(factionName, FactionWorkType.hacking);
        await ns.sleep(defaultSleepTime);
    }

    const moneyFarm = CrimeFunctions.farmMoney(ns);
    while (ns.getPlayer().money < moneyCost) {
        await moneyFarm();
    }

    purchaseOrder.forEach((augName) =>
        ns.singularity.purchaseAugmentation(factionName, augName),
    );
    while (ns.singularity.upgradeHomeRam()) continue;
    while (
        ns.singularity.purchaseAugmentation(factionName, 'NeuroFlux Governor')
    )
        continue;
    while (ns.singularity.upgradeHomeCores()) continue;
    if (!skipReset) ns.singularity.installAugmentations(startUpScript);
}

export async function neuroSpamReset(
    ns: NS,
    target: number,
    count = 10,
    factionName = FactionName.BitRunners,
) {
    while (!FactionFunctions.inFaction(ns, factionName)) {
        if (FactionFunctions.invitedToFaction(ns, factionName)) {
            ns.singularity.joinFaction(factionName);
        } else {
            ns.singularity.universityCourse(
                'ZB Institute of Technology',
                'Algorithms',
            );
            await ns.sleep(defaultSleepTime);
        }
    }

    while (count < 10 && getNeurofluxLevel(ns) < target) {
        if (
            ns.singularity.getFactionRep(factionName) >
                ns.singularity.getAugmentationRepReq('NeuroFlux Governor') &&
            ns.getPlayer().money >
                ns.singularity.getAugmentationPrice('NeuroFlux Governor')
        ) {
            ns.singularity.purchaseAugmentation(
                factionName,
                'NeuroFlux Governor',
            );
            count++;
        }
        ns.singularity.workForFaction(factionName, FactionWorkType.hacking);
        await ns.sleep(defaultSleepTime);
    }

    ns.singularity.installAugmentations(startUpScript);
}

export function getNeurofluxLevel(ns: NS): number {
    const baseRep = 500 * ns.getBitNodeMultipliers().AugmentationRepCost;
    const multi = 1.14;
    const repReq = ns.singularity.getAugmentationRepReq('NeuroFlux Governor');
    return (
        // dont fucking ask
        (-1 * Math.log(baseRep / repReq)) /
        (-1 * Math.log(2) + Math.log(3) - 2 * Math.log(5) + Math.log(19))
    );
}
