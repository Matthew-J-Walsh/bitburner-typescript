import { GymType, NS, UniversityClassType } from '@ns';
import { Action, defaultSleepTime, SkillName } from '../constants';
import { DefaultFunctions } from './defaults';
import { Story } from './story';

export class TrainingFunctions extends DefaultFunctions {
    public static trainingStory(
        ns: NS,
        thresholds: Partial<Record<SkillName, number>>,
    ): Story {
        return new Story(
            ns,
            () => true,
            TrainingFunctions.trainToThresholds(ns, thresholds),
        );
    }

    public static trainToThresholds(
        ns: NS,
        thresholds: Partial<Record<SkillName, number>>,
    ): Action {
        const player = ns.getPlayer();

        const sector12Skills: SkillName[] = [];
        const volhavenSkills: SkillName[] = [];

        for (const skill of Object.keys(thresholds) as SkillName[]) {
            const currentLevel =
                player.skills[skill as keyof typeof player.skills];
            const targetLevel = thresholds[skill]!;

            if (currentLevel >= targetLevel) {
                continue;
            }

            if (
                ['strength', 'defense', 'dexterity', 'agility'].includes(skill)
            ) {
                sector12Skills.push(skill);
            } else if (['hacking', 'charisma'].includes(skill)) {
                volhavenSkills.push(skill);
            }
        }

        return async () => {
            if (sector12Skills.length === 0 && volhavenSkills.length === 0) {
                return;
            }

            const currentCity = player.city;

            // Prioritize current city to avoid travel costs
            if (currentCity === 'Sector-12' && sector12Skills.length > 0) {
                await TrainingFunctions.trainInSector12(
                    ns,
                    thresholds,
                    sector12Skills,
                );
            } else if (
                currentCity === 'Volhaven' &&
                volhavenSkills.length > 0
            ) {
                await TrainingFunctions.trainInVolhaven(
                    ns,
                    thresholds,
                    volhavenSkills,
                );
            }

            // Not in the right city - travel to whichever has work
            if (sector12Skills.length > 0) {
                await TrainingFunctions.trainInSector12(
                    ns,
                    thresholds,
                    sector12Skills,
                );
            } else if (volhavenSkills.length > 0) {
                await TrainingFunctions.trainInVolhaven(
                    ns,
                    thresholds,
                    volhavenSkills,
                );
            }
        };
    }

    private static async trainInSector12(
        ns: NS,
        thresholds: Partial<Record<SkillName, number>>,
        skills: SkillName[],
    ): Promise<void> {
        const player = ns.getPlayer();

        const skillToStat: Record<string, string> = {
            strength: 'str',
            defense: 'def',
            dexterity: 'dex',
            agility: 'agi',
        };

        const currentWork = ns.singularity.getCurrentWork();

        for (const skill of skills) {
            const currentLevel =
                player.skills[skill as keyof typeof player.skills];
            while (currentLevel < thresholds[skill]!) {
                const stat = skillToStat[skill] as GymType;
                if (
                    !currentWork ||
                    !(
                        currentWork.type === 'CLASS' &&
                        currentWork.classType === stat
                    )
                ) {
                    ns.singularity.gymWorkout('Powerhouse Gym', stat);
                }
                await ns.sleep(defaultSleepTime);
            }
        }
    }

    private static async trainInVolhaven(
        ns: NS,
        thresholds: Partial<Record<SkillName, number>>,
        skills: SkillName[],
    ): Promise<void> {
        const player = ns.getPlayer();

        const skillToCourse: Record<string, string> = {
            hacking: 'Algorithms',
            charisma: 'Leadership',
        };

        const currentWork = ns.singularity.getCurrentWork();

        for (const skill of skills) {
            const currentLevel =
                player.skills[skill as keyof typeof player.skills];
            while (currentLevel < thresholds[skill]!) {
                const course = skillToCourse[skill] as UniversityClassType;
                if (
                    !currentWork ||
                    !(
                        currentWork.type === 'CLASS' &&
                        currentWork.classType === course
                    )
                ) {
                    ns.singularity.universityCourse(
                        'ZB Institute of Technology',
                        course,
                    );
                }
                await ns.sleep(defaultSleepTime);
            }
        }
    }
}
