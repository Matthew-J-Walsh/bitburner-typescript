import { FactionName, NS } from '@ns';
import { multipleAugMultiplier } from '../constants';
import { DefaultFunctions } from './defaults';

export class AugmentationFunctions extends DefaultFunctions {
    public static augmentPurchaseOrder(
        ns: NS,
        augNames: string[],
    ): [string[], number] {
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

            (bestOrder.length === augNames.length
                ? bestOrder
                : augNames
            ).forEach((augName) => {
                if (remaining.has(augName)) {
                    const newRemaining = new Set(remaining);
                    newRemaining.delete(augName);
                    backtrack(
                        newRemaining,
                        [...order, augName],
                        currentCost +
                            ns.singularity.getAugmentationBasePrice(augName) *
                                currentMultiplier,
                        currentMultiplier * multipleAugMultiplier,
                    );
                }
            });
        }

        backtrack(new Set(augNames), [], 0, 1);

        return [bestOrder, bestCost];
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

    public static maxRepRequirement(ns: NS, augNames: string[]) {
        return Math.max(...augNames.map(ns.singularity.getAugmentationRepReq));
    }
}
