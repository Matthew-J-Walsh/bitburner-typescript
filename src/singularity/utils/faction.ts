import { FactionName, FactionWorkType, NS } from '@ns';
import {
    Action,
    Check,
    defaultSleepTime,
    multipleAugMultiplier,
    startUpScript,
} from '../constants';
import { DefaultFunctions } from './defaults';
import { Story } from './story';

export class FactionFunctions extends DefaultFunctions {
    public static factionStory(
        ns: NS,
        faction: FactionName,
        work: FactionWorkType,
        factionRep?: number,
        targetFavor?: number,
    ): Story {
        let repA = 0;
        let repB = 0;
        if (factionRep) repA = factionRep;
        if (targetFavor)
            repB =
                ns.formulas.reputation.calculateFavorToRep(targetFavor) -
                ns.formulas.reputation.calculateFavorToRep(
                    ns.singularity.getFactionFavor(faction),
                );
        const reputationTarget = Math.max(repA, repB);

        return new Story(
            ns,
            FactionFunctions.invitedToFaction(ns, faction),
            async () => {
                ns.singularity.joinFaction(faction);
                await FactionFunctions.workForFaction(
                    ns,
                    faction,
                    work,
                    reputationTarget,
                );
            },
        );
    }

    public static invitedToFaction(ns: NS, faction: FactionName): Check {
        return () => {
            return ns.singularity.checkFactionInvitations().includes(faction);
        };
    }

    public static inFaction(ns: NS, faction: FactionName): Check {
        return () => {
            return ns.getPlayer().factions.includes(faction);
        };
    }

    public static aboveFactionRep(
        ns: NS,
        faction: FactionName,
        target: number,
    ): Check {
        return () => {
            return ns.singularity.getFactionRep(faction) > target;
        };
    }

    public static aboveDonationFavor(ns: NS, faction: FactionName): Check {
        const target = 150 * ns.getBitNodeMultipliers().RepToDonateToFaction;
        return () => {
            return (
                ns.singularity.getFactionFavor(faction) +
                    ns.singularity.getFactionFavorGain(faction) >
                target
            );
        };
    }

    public static joinFaction(ns: NS, faction: FactionName): Action {
        return async () => {
            ns.singularity.joinFaction(faction);
        };
    }

    public static workForFaction(
        ns: NS,
        faction: FactionName,
        work: FactionWorkType,
        reputationTarget: number,
    ): Action {
        return async () => {
            ns.singularity.workForFaction(faction, work);
            while (ns.singularity.getFactionRep(faction) < reputationTarget) {
                await ns.sleep(defaultSleepTime);
            }
        };
    }
}
