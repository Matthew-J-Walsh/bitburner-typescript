import { CityName, NS } from '@ns';
import { Action, Check, defaultSleepTime, SkillName } from '../constants';
import { Story } from './story';

export class DefaultFunctions {
    public static travelStory(ns: NS, city: CityName): Story {
        return new Story(
            ns,
            DefaultFunctions.aboveMoney(ns, 2e5),
            DefaultFunctions.travelToCity(ns, city),
        );
    }

    public static aboveMoney(ns: NS, money: number): Check {
        return () => {
            //TODO: We should probably communicate to the money maker that we need some cash
            return ns.getPlayer().money > money;
        };
    }

    public static aboveSkillThreshold(
        ns: NS,
        skills: Record<SkillName, number>,
    ): Check {
        const entries = Object.entries(skills);
        return () => {
            const currentSkills = ns.getPlayer().skills as any;
            return entries.every(
                ([skill, minimum]) => currentSkills[skill] >= minimum,
            );
        };
    }

    public static travelToCity(ns: NS, city: CityName): Action {
        return async () => {
            ns.singularity.travelToCity(city);
            await ns.sleep(defaultSleepTime); // wait because we are probably here to get a faction invite
        };
    }
}
