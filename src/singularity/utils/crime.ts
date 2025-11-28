import { CrimeType, NS } from '@ns';
import { Action, Check, CrimeTimes } from '../constants';
import { DefaultFunctions } from './defaults';
import { Story } from './story';
import { SleeveFunctions } from './sleeves';

export class CrimeFunctions extends DefaultFunctions {
    public static karamStory(ns: NS, karma = -54000): Story {
        return new Story(ns, () => true, CrimeFunctions.farmKarma(ns, karma));
    }

    public static moneyStory(ns: NS, money: number): Story {
        return new Story(ns, () => true, CrimeFunctions.farmMoney(ns));
    }

    public static belowKarma(ns: NS, karma = -54000): Check {
        return () => {
            return ns.heart.break() < karma;
        };
    }

    public static farmKarma(ns: NS, karma = -54000): Action {
        return async () => {
            const currentWork = ns.singularity.getCurrentWork();
            while (
                ns.formulas.work.crimeSuccessChance(
                    ns.getPlayer(),
                    'Homicide',
                ) < 0.5
            ) {
                if (
                    !currentWork ||
                    !(
                        currentWork.type === 'CRIME' &&
                        currentWork.crimeType === 'Mug'
                    )
                )
                    ns.singularity.commitCrime('Mug');
                await ns.sleep(CrimeTimes['Mug']);
            }
            while (ns.heart.break() > karma) {
                if (
                    !currentWork ||
                    !(
                        currentWork.type === 'CRIME' &&
                        currentWork.crimeType === 'Homicide'
                    )
                )
                    ns.singularity.commitCrime('Homicide');
                await ns.sleep(CrimeTimes['Homicide']);
            }
        };
    }

    public static farmMoney(ns: NS): Action {
        return async () => {
            const player = ns.getPlayer();

            const best: { crime: CrimeType; value: number } = Object.entries(
                CrimeTimes,
            ).reduce(
                (best, [crime, time]) => {
                    if (time > 1e4) return best;
                    const gains = ns.formulas.work.crimeGains(
                        player,
                        crime as CrimeType,
                    );
                    const chance = ns.formulas.work.crimeSuccessChance(
                        player,
                        crime as CrimeType,
                    );
                    const value = (chance * gains.money) / time;

                    if (value > best.value)
                        return { crime: crime as CrimeType, value: value };
                    return best;
                },
                { crime: 'Shoplift' as CrimeType, value: 0 },
            );

            const currentWork = ns.singularity.getCurrentWork();
            if (
                !currentWork ||
                !(
                    currentWork.type === 'CRIME' &&
                    currentWork.crimeType === best.crime
                )
            )
                ns.singularity.commitCrime(best.crime);

            CrimeFunctions.sleeveFarmMoney(ns);
            await ns.sleep(CrimeTimes[best.crime]);
        };
    }

    public static sleeveFarmMoney(ns: NS) {
        for (let i = 0; i < ns.sleeve.getNumSleeves(); i++) {
            if (SleeveFunctions.sleeveBlock(ns, i)) continue;

            const sleeve = ns.sleeve.getSleeve(i);

            const best: { crime: CrimeType; value: number } = Object.entries(
                CrimeTimes,
            ).reduce(
                (best, [crime, time]) => {
                    if (time > 1e4) return best;
                    const gains = ns.formulas.work.crimeGains(
                        sleeve,
                        crime as CrimeType,
                    );
                    const chance = ns.formulas.work.crimeSuccessChance(
                        sleeve,
                        crime as CrimeType,
                    );
                    const value = (chance * gains.money) / time;

                    if (value > best.value)
                        return { crime: crime as CrimeType, value: value };
                    return best;
                },
                { crime: 'Shoplift' as CrimeType, value: 0 },
            );

            const currentWork = ns.sleeve.getTask(i);
            if (
                !currentWork ||
                !(
                    currentWork.type === 'CRIME' &&
                    currentWork.crimeType === best.crime
                )
            )
                ns.sleeve.setToCommitCrime(i, best.crime);
        }
    }
}
