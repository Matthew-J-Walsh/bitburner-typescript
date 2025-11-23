import { FactionName, NS } from '@ns';
import { multipleAugMultiplier, startUpScript } from '../constants';
import { Story } from './story';
import { DefaultFunctions } from './defaults';

export class AugmentationFunctions extends DefaultFunctions {
    public static augmentResetStory(
        ns: NS,
        augList: Partial<Record<FactionName, string[]>>,
        homeComputerRam = false,
    ): Story {
        const allAugs = Object.values(augList).flat();
        //we need to filter out neuroflux governer level requests
        const orderedAugs: string[] =
            AugmentationFunctions.augmentPurchaseOrder(ns, allAugs);

        let multiplier = 1;
        const cost = orderedAugs.reduce((total, augName) => {
            multiplier *= multipleAugMultiplier;
            return (
                total +
                (ns.singularity.getAugmentationBasePrice(augName) *
                    multiplier) /
                    multipleAugMultiplier
            );
        }, 0);

        const augFactions: Record<string, FactionName> = Object.fromEntries(
            Object.entries(augList).flatMap(([key, values]) =>
                values.map((value) => [value, key as FactionName]),
            ),
        );

        return new Story(
            ns,
            AugmentationFunctions.aboveMoney(ns, cost),
            async () => {
                orderedAugs.forEach((aug) => {
                    if (
                        !ns.singularity.purchaseAugmentation(
                            augFactions[aug],
                            aug,
                        )
                    )
                        throw new Error('Error when buying augs!');
                });
                if (homeComputerRam) {
                    while (ns.singularity.upgradeHomeRam()) continue;
                    while (ns.singularity.upgradeHomeCores()) continue;
                }
                const highestFaction = Object.keys(augList).reduce(
                    (best, faction) =>
                        ns.singularity.getFactionRep(faction) > best.rep
                            ? {
                                  name: faction,
                                  rep: ns.singularity.getFactionRep(faction),
                              }
                            : best,
                    { name: Object.keys(augList)[0], rep: 0 },
                ).name;
                while (
                    ns.singularity.purchaseAugmentation(
                        highestFaction,
                        'NeuroFlux Governor',
                    )
                )
                    continue;
                ns.singularity.installAugmentations(startUpScript);
            },
        );
    }

    private static augmentPurchaseOrder(ns: NS, augList: string[]): string[] {
        let bestOrder: string[] = [];
        let bestCost = Infinity;

        function backtrack(
            remaining: Set<string>,
            order: string[],
            currentCost: number,
            currentMultiplier: number,
        ): void {
            if (currentCost >= bestCost) return;

            if (remaining.size === 0) {
                if (currentCost < bestCost) {
                    bestCost = currentCost;
                    bestOrder = [...order];
                }
                return;
            }

            const valid = [...remaining].filter((augName) =>
                ns.singularity
                    .getAugmentationPrereq(augName)
                    .every((prereq) => !remaining.has(prereq)),
            );

            (bestOrder.length === augList.length ? bestOrder : augList).forEach(
                (augName) => {
                    if (remaining.has(augName)) {
                        const newRemaining = new Set(remaining);
                        newRemaining.delete(augName);
                        backtrack(
                            newRemaining,
                            [...order, augName],
                            currentCost +
                                ns.singularity.getAugmentationBasePrice(
                                    augName,
                                ) *
                                    currentMultiplier,
                            currentMultiplier * multipleAugMultiplier,
                        );
                    }
                },
            );
        }

        backtrack(new Set(augList), [], 0, 1);

        return bestOrder;
    }

    public static augmentRepHelper(
        ns: NS,
        augList: Partial<Record<FactionName, string[]>>,
    ): Partial<Record<FactionName, number>> {
        return Object.fromEntries(
            Object.entries(augList).map(([faction, augNames]) => [
                faction,
                Math.max(
                    ...augNames.map((augName) =>
                        ns.singularity.getAugmentationRepReq(augName),
                    ),
                ),
            ]),
        );
    }
}
