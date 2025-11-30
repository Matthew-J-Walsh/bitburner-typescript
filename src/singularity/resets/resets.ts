import { NS } from '@ns';
import { PiecewiseReset, Reset } from '../constants';
import { companyPartialReset } from './company';
import { factionReset, getNeurofluxLevel, neuroSpamReset } from './faction';
import { graftingReset, partialGraftingReset } from './grafting';

export function checkReset(ns: NS, reset: Reset): boolean {
    const ownedAugments = ns.singularity.getOwnedAugmentations();
    switch (reset.type) {
        case 'faction':
            return (
                reset.augments.every((augName) =>
                    ownedAugments.includes(augName),
                ) && ns.singularity.getFactionFavor(reset.faction) > reset.favor
            );
        case 'neuroflux':
            return getNeurofluxLevel(ns) >= reset.target;
        case 'grafting':
            return ownedAugments.includes(reset.augName);
        case 'piecewise':
            return reset.partials.every((partial) => {
                switch (partial.type) {
                    case 'faction':
                        return (
                            partial.augments.every((augName) =>
                                ownedAugments.includes(augName),
                            ) &&
                            ns.singularity.getFactionFavor(partial.faction) >
                                partial.favor
                        );
                    case 'company':
                        return ns.singularity
                            .checkFactionInvitations()
                            .includes(partial.companyName);
                    case 'graftingP':
                        return ownedAugments.includes(partial.augName);
                    default:
                        throw new Error('Bruh');
                }
            });
        default:
            throw new Error('Bruh');
    }
}

export async function runReset(ns: NS, reset: Reset) {
    switch (reset.type) {
        case 'faction':
            await factionReset(ns, reset.faction, reset.augments, reset.favor);
            break;
        case 'neuroflux':
            await neuroSpamReset(ns, reset.target, reset.count, reset.faction);
            break;
        case 'grafting':
            await graftingReset(ns, reset.augName);
            break;
        case 'piecewise':
            await piecewiseReset(ns, reset);
            break;
        default:
            throw new Error('Bruh');
    }
}

export async function piecewiseReset(ns: NS, reset: PiecewiseReset) {
    for (let i = 0; i < reset.partials.length; i++) {
        const partial = reset.partials[i];
        switch (partial.type) {
            case 'faction':
                await factionReset(
                    ns,
                    partial.faction,
                    partial.augments,
                    partial.favor,
                    true,
                );
                break;
            case 'company':
                await companyPartialReset(
                    ns,
                    partial.companyName,
                    partial.field,
                );
                break;
            case 'graftingP':
                await partialGraftingReset(ns, partial.augName);
                break;
            default:
                throw new Error('Bruh');
        }
    }
}
