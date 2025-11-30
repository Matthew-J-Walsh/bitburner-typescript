import { FactionName, FactionWorkType, NS } from '@ns';
import { Action, Check, defaultSleepTime } from '../constants';
import { DefaultFunctions } from './defaults';
import { Story } from './story';
import { SleeveFunctions } from './sleeves';

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
            FactionFunctions.invitedToFaction(ns, faction) ||
                FactionFunctions.inFaction(ns, faction),
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

    public static aboveFactionFavor(
        ns: NS,
        faction: FactionName,
        target: number,
    ): Check {
        return () => {
            return (
                ns.singularity.getFactionFavorGain(faction) +
                    ns.singularity.getFactionFavor(faction) >
                target
            );
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
                FactionFunctions.sleeveFactionWork(
                    ns,
                    faction,
                    work,
                    reputationTarget,
                );
                await ns.sleep(defaultSleepTime);
            }
            for (let i = 0; i < ns.sleeve.getNumSleeves(); i++) {
                if (SleeveFunctions.sleeveBlock(ns, i)) continue;

                ns.sleeve.setToUniversityCourse(
                    i,
                    'Rothman University',
                    'Algorithms',
                );
            }
        };
    }

    public static sleeveFactionWork(
        ns: NS,
        faction: FactionName,
        work: FactionWorkType,
        reputationTarget: number,
    ) {
        const favor = ns.singularity.getFactionFavor(faction);
        const baseRepRate = ns.formulas.work.factionGains(
            ns.getPlayer(),
            work,
            favor,
        ).reputation;

        for (let i = 0; i < ns.sleeve.getNumSleeves(); i++) {
            if (SleeveFunctions.sleeveBlock(ns, i)) continue;

            const task = ns.sleeve.getTask(i);
            if (task && task.type === 'FACTION' && task.factionName === faction)
                continue;

            const sleeve = ns.sleeve.getSleeve(i);

            const repRate = ns.formulas.work.factionGains(
                sleeve,
                work,
                favor,
            ).reputation;
            const mockSleeve = structuredClone(sleeve);
            mockSleeve.skills.hacking += 1;
            const nextRepRate = ns.formulas.work.factionGains(
                mockSleeve,
                work,
                favor,
            ).reputation;

            const expRate =
                ns.formulas.work.universityGains(
                    sleeve,
                    'Algorithms',
                    'Rothman University',
                ).hackExp -
                ns.formulas.work.factionGains(sleeve, work, favor).hackExp;
            const expPerLevel =
                ns.formulas.skills.calculateExp(
                    sleeve.skills.hacking + 1,
                    sleeve.mults.hacking_exp,
                ) -
                ns.formulas.skills.calculateExp(
                    sleeve.skills.hacking,
                    sleeve.mults.hacking_exp,
                );

            const delta = (expRate / expPerLevel) * (nextRepRate - repRate);

            const timeEst =
                (reputationTarget - ns.singularity.getFactionRep(faction)) /
                (baseRepRate + 8 * repRate);

            if (delta * timeEst > baseRepRate + 8 * repRate) {
                if (
                    !task ||
                    task.type !== 'CLASS' ||
                    task.classType !== 'Algorithms'
                )
                    ns.sleeve.setToUniversityCourse(
                        i,
                        'Rothman University',
                        'Algorithms',
                    );
            } else ns.sleeve.setToFactionWork(i, faction, 'hacking');
        }
    }
}
