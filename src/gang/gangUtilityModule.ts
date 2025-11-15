import {
    Gang,
    GangGenInfo,
    GangMemberInfo,
    GangOtherInfoObject,
    GangTaskStats,
    NS,
    Task,
} from '@ns';
import { BaseModule } from '/lib/baseModule';

/**
 * Notes:
 * To optimize rep we want to go for: respect gained - wanted gained
 * To optimize money we want to go for: money gained * (1 - wanted gained / rep gained)
 * Stats is obvious
 * For the time being we focus entirely on building out our gang until we hit territory cap
 *
 * Following standard temporal math we are trying to maximize stat gain, thus:
 * The multiplier of an upgrade is its average multiplier on our stats that we train (so maybe not hacking)
 * The cost of an upgrade is the time loss to obtain it so if it halves our stat gain for 50s that is 25s cost
 * The multiplier of an additional unit is new units / old units
 * The cost of an additional unit is the time it takes to build up the rep
 * The multiplier of exp is the ascension bonus
 *
 *
 * We reset at at least 45% of our current total xp across ascensions
 * We get up to at least 50%? the top level before we stop just training (or some baseline level on rip)
 * We only reset if the loss is below like X%?
 * Rep has an additional continuous cost for continuous multiplier
 *
 * For territory, we make sure that on average our gang members combined will get like 2-5x the power of the top gang before we go for territory
 * Effectively the game is a race to getting our power to some point
 *
 * Good hunting
 */

/**
 * ### GangUtilityModule Uniqueness
 * This modules handles ????
 */
//export class GangUtilityModule extends BaseModule {}

export class GangUtilityFunctions {
    public static getWeights(
        powerRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
        buildupPortion: number,
        bestUpgrade: { multi: number; cost: number },
    ): any {
        //buildupPortion = GangUtilityFunctions.getEstimatedBuildUpPortion(gangInfo, gangOtherInfo)
        //const timeEstimate = GangUtilityFunctions.getTimeEstimate(powerRemaining, gangMember, gangInfo, gangOtherInfo)
        const weights = {
            power: GangUtilityFunctions.getPowerWeight(
                powerRemaining,
                gangMember,
                gangInfo,
                gangOtherInfo,
            ),
            ...GangUtilityFunctions.getExpWeights(
                gangMember,
                gangInfo,
                gangOtherInfo,
            ),
            ...{
                rep:
                    buildupPortion *
                    GangUtilityFunctions.getRepWeight(gangInfo, gangOtherInfo),
                money: GangUtilityFunctions.getMoneyWeight(
                    bestUpgrade,
                    gangInfo,
                    gangOtherInfo,
                ),
                wanted:
                    buildupPortion *
                    GangUtilityFunctions.getWantedWeight(
                        gangInfo,
                        gangOtherInfo,
                    ),
            },
        };
        return weights;
    }

    public static getTimeEstimate(
        powerRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        return (
            powerRemaining /
            ((gangMember.hack +
                gangMember.str +
                gangMember.def +
                gangMember.dex +
                gangMember.agi) /
                95)
        );
    }

    // Weights should be the decimal speed up per 1 point, we factor in remaining task percent outside of these

    public static getPowerWeight(
        powerRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        const val =
            (gangMember.hack +
                gangMember.str +
                gangMember.def +
                gangMember.dex +
                gangMember.agi) /
            95 /
            powerRemaining;
        return (
            val -
            GangUtilityFunctions.getDeathRisk(gangMember) /
                (powerRemaining + gangInfo.power)
        ); // we only care about power for the initial decision
    }

    public static getExpWeights(
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): {
        hack: number;
        str: number;
        def: number;
        dex: number;
        agi: number;
        cha: number;
    } {
        return {
            hack: 1,
            str: 1,
            def: 1,
            dex: 1,
            agi: 1,
            cha: 1,
        };
        TODO;
    }

    public static getRepWeight(
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        return (
            (gangInfo.respect + 1) /
                (gangInfo.respect + gangInfo.wantedLevel + 1) /
                gangInfo.wantedPenalty -
            1
        );
    }

    public static getMoneyWeight(
        bestUpgrade: { multi: number; cost: number },
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        return (bestUpgrade.multi - 1) / bestUpgrade.cost;
    }

    public static getWantedWeight(
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        // 20 is equivalent to 95%
        const multi = Math.max(
            20,
            gangInfo.respect / (gangInfo.wantedLevel + 0.1),
        );
        return (
            -1 *
            multi *
            GangUtilityFunctions.getRepWeight(gangInfo, gangOtherInfo)
        );
    }

    public static calculateExpGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
    ): {
        hack_exp: number;
        str_exp: number;
        def_exp: number;
        dex_exp: number;
        agi_exp: number;
        cha_exp: number;
    } {
        const expValues = {
            hack_exp: 0,
            str_exp: 0,
            def_exp: 0,
            dex_exp: 0,
            agi_exp: 0,
            cha_exp: 0,
        };

        const difficultyMult = Math.pow(taskStats.difficulty, 0.9);
        const difficultyPerCycles = difficultyMult;
        const weightDivisor = 1500;
        const expMult = {
            hack: (gangMember.hack_mult - 1) / 4 + 1,
            str: (gangMember.str_mult - 1) / 4 + 1,
            def: (gangMember.def_mult - 1) / 4 + 1,
            dex: (gangMember.dex_mult - 1) / 4 + 1,
            agi: (gangMember.agi_mult - 1) / 4 + 1,
            cha: (gangMember.cha_mult - 1) / 4 + 1,
        };

        expValues.hack_exp +=
            (taskStats.hackWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.hack *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.hack_asc_points,
            );

        expValues.str_exp +=
            (taskStats.strWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.str *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.str_asc_points,
            );

        expValues.def_exp +=
            (taskStats.defWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.def *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.def_asc_points,
            );

        expValues.dex_exp +=
            (taskStats.dexWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.dex *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.dex_asc_points,
            );

        expValues.agi_exp +=
            (taskStats.agiWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.agi *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.agi_asc_points,
            );

        expValues.cha_exp +=
            (taskStats.chaWeight / weightDivisor) *
            difficultyPerCycles *
            expMult.cha *
            GangUtilityFunctions.calculateAscensionMult(
                gangMember.cha_asc_points,
            );

        return expValues;
    }

    public static calculateAscensionMult(points: number): number {
        return Math.max(Math.pow(points / 2000, 0.5), 1);
    }

    public static getPowerGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
    ): number {
        if (taskStats.name != 'Territory Warfare') return 0;
        return (
            (gangMember.hack +
                gangMember.str +
                gangMember.def +
                gangMember.dex +
                gangMember.agi) /
            95
        );
    }

    // Chance * time cost
    // death rate: triple it to 2% death rate
    public static getDeathRisk(gangMember: GangMemberInfo): number {
        const chance = 0.02 / Math.pow(gangMember.def, 0.6);
        const avg =
            (gangMember.str_exp +
                gangMember.str_asc_points +
                gangMember.def_exp +
                gangMember.def_asc_points +
                gangMember.dex_exp +
                gangMember.dex_asc_points +
                gangMember.agi_exp +
                gangMember.agi_asc_points) /
            4;
        const time = ((Math.sqrt(avg) * 25) / 1500) * Math.pow(100, 0.9);
        return chance * time;
    }

    /**
     * Estimates the percentage of time that will be spent doing stuff
     * that depends on repuation, money, or wanted
     * Informs us how to weigh the value of those tasks
     */
    public static getEstimatedBuildUpPortion(
        gangInfo: GangGenInfo,
        gangOtherInfo: GangOtherInfoObject,
    ): number {
        return 0.7;
    }
}
