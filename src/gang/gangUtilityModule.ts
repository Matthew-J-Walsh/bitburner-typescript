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
import { gangMemberStatList, targetGangWinPower } from './constants';

/**
 * ### GangUtilityFunctions Uniqueness
 * This modules handles calculations for gangs
 */
export class GangUtilityFunctions {
    /**
     * Calculates the evaluation for a task
     * @param gangMember
     * @param taskStats
     * @param gangInfo
     * @param weights
     * @returns
     */
    public static evaluateTask(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
        gangInfo: GangGenInfo,
        weights: {
            power: number;
            hack_exp: number;
            str_exp: number;
            def_exp: number;
            dex_exp: number;
            agi_exp: number;
            cha_exp: number;
            respect: number;
            wanted: number;
            money: number;
        },
    ): number {
        const expGains = GangUtilityFunctions.calculateExpGain(
            gangMember,
            taskStats,
        );
        const taskValues = {
            ...{
                power: GangUtilityFunctions.getPowerGain(gangMember, taskStats),
                respect: GangUtilityFunctions.calculateRespectGain(
                    gangMember,
                    taskStats,
                    gangInfo,
                ),
                wanted: GangUtilityFunctions.calculateWantedGain(
                    gangMember,
                    taskStats,
                    gangInfo,
                ),
                money: GangUtilityFunctions.calculateMoneyGain(
                    gangMember,
                    taskStats,
                    gangInfo,
                ),
            },
            ...expGains,
        };
        return (
            taskValues.power * weights.power +
            taskValues.hack_exp * weights.hack_exp +
            taskValues.str_exp * weights.str_exp +
            taskValues.def_exp * weights.def_exp +
            taskValues.dex_exp * weights.dex_exp +
            taskValues.agi_exp * weights.agi_exp +
            taskValues.cha_exp * weights.cha_exp +
            taskValues.respect * weights.respect +
            taskValues.wanted * weights.wanted +
            taskValues.money * weights.money
        );
    }

    public static getStage0Weights(
        powerRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        bestUpgradeValue: number,
        gangCount: number,
    ): {
        power: number;
        hack_exp: number;
        str_exp: number;
        def_exp: number;
        dex_exp: number;
        agi_exp: number;
        cha_exp: number;
        respect: number;
        wanted: number;
        money: number;
    } {
        const rwmRatio =
            GangUtilityFunctions.getEstimatedBuildUpPortion(gangInfo);
        return {
            power:
                (1.0 / rwmRatio) *
                GangUtilityFunctions.getPowerWeight(
                    powerRemaining,
                    gangMember,
                    gangInfo,
                ),
            ...GangUtilityFunctions.getExpWeights(gangMember, gangInfo),
            ...{
                respect:
                    (1.0 / rwmRatio) *
                    GangUtilityFunctions.getRepWeight(gangInfo, gangCount),
                wanted:
                    (1.0 / rwmRatio) *
                    GangUtilityFunctions.getWantedWeight(gangInfo),
                money: (1.0 / rwmRatio) * bestUpgradeValue,
                //money: GangUtilityFunctions.getMoneyWeight(bestUpgrade,gangInfo,),
            },
        };
    }

    public static getStage1Weights(
        respectRemaining: number,
        moneyRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
        bestUpgradeValue: number,
        gangCount: number,
    ): {
        power: number;
        hack_exp: number;
        str_exp: number;
        def_exp: number;
        dex_exp: number;
        agi_exp: number;
        cha_exp: number;
        respect: number;
        wanted: number;
        money: number;
    } {
        const rwmRatio =
            GangUtilityFunctions.getEstimatedBuildUpPortion(gangInfo);
        const respectBonus = respectRemaining > 0 ? 1.0 / respectRemaining : 0;
        const moneyBonus = respectRemaining > 0 ? 0 : 1.0 / moneyRemaining;
        return {
            power: 0,
            ...GangUtilityFunctions.getExpWeights(gangMember, gangInfo),
            ...{
                respect:
                    (1.0 / rwmRatio) *
                    (respectBonus +
                        GangUtilityFunctions.getRepWeight(gangInfo, gangCount)),
                wanted:
                    (1.0 / rwmRatio) *
                    GangUtilityFunctions.getWantedWeight(gangInfo),
                money: (1.0 / rwmRatio) * (moneyBonus + bestUpgradeValue),
                //GangUtilityFunctions.getMoneyWeight(bestUpgrade, gangInfo),
            },
        };
    }

    public static getTimeEstimate(
        powerRemaining: number,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
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
            GangUtilityFunctions.getDeathRisk(gangMember, gangInfo) /
                (powerRemaining + gangInfo.power)
        );
    }

    public static getExpWeights(
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
    ): {
        hack_exp: number;
        str_exp: number;
        def_exp: number;
        dex_exp: number;
        agi_exp: number;
        cha_exp: number;
    } {
        const skillDeltas =
            GangUtilityFunctions.calculateSkillDeltas(gangMember);
        const ascDeltas =
            GangUtilityFunctions.calculateAscensionDeltas(gangMember);
        return {
            hack_exp: 0, //skillDeltas.hack + ascDeltas.hack,
            str_exp: skillDeltas.str + ascDeltas.str,
            def_exp: skillDeltas.def + ascDeltas.def,
            dex_exp: skillDeltas.dex + ascDeltas.dex,
            agi_exp: skillDeltas.agi + ascDeltas.agi,
            cha_exp: 0, //skillDeltas.cha + ascDeltas.cha,
        };
    }

    public static getRepWeight(
        gangInfo: GangGenInfo,
        gangCount: number,
    ): number {
        const newRecruitBonus =
            (2 * 1) /
            gangCount /
            (gangInfo.respectForNextRecruit - gangInfo.respect); // TODO: we could downscale but we really like recruitment
        return (
            newRecruitBonus +
            (gangInfo.respect + 1) /
                (gangInfo.respect + gangInfo.wantedLevel + 1) /
                gangInfo.wantedPenalty -
            1
        );
    }

    public static getMoneyWeight(
        bestUpgradeValue: number,
        gangInfo: GangGenInfo,
    ): number {
        return bestUpgradeValue;
    }

    public static getWantedWeight(gangInfo: GangGenInfo): number {
        // 20 is equivalent to 95%
        const multi = Math.max(
            20,
            (gangInfo.respect + gangInfo.wantedLevel) / gangInfo.respect,
        );
        const rep =
            (gangInfo.respect + 1) /
                (gangInfo.respect + gangInfo.wantedLevel + 1) /
                gangInfo.wantedPenalty -
            1;

        return -1 / (gangInfo.respect + gangInfo.wantedLevel + 100);
        //if (gangInfo.respect < 100) return -1 * rep;
        //return -1 * multi * rep;
    }

    public static calculateRespectGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
        gangInfo: GangGenInfo,
    ): number {
        if (taskStats.baseRespect === 0) return 0;
        let statWeight =
            (taskStats.hackWeight / 100) * gangMember.hack +
            (taskStats.strWeight / 100) * gangMember.str +
            (taskStats.defWeight / 100) * gangMember.def +
            (taskStats.dexWeight / 100) * gangMember.dex +
            (taskStats.agiWeight / 100) * gangMember.agi +
            (taskStats.chaWeight / 100) * gangMember.cha;
        statWeight -= 4 * taskStats.difficulty;
        if (statWeight <= 0) return 0;
        const territoryMult = Math.max(
            0.005,
            Math.pow(gangInfo.territory * 100, taskStats.territory.respect) /
                100,
        );
        const territoryPenalty = (0.2 * gangInfo.territory + 0.8) * 1;
        if (isNaN(territoryMult) || territoryMult <= 0) return 0;
        const respectMult = gangInfo.wantedPenalty;
        return Math.pow(
            11 *
                taskStats.baseRespect *
                statWeight *
                territoryMult *
                respectMult,
            territoryPenalty,
        );
    }

    public static calculateWantedGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
        gangInfo: GangGenInfo,
    ): number {
        if (taskStats.baseWanted === 0) return 0;
        let statWeight =
            (taskStats.hackWeight / 100) * gangMember.hack +
            (taskStats.strWeight / 100) * gangMember.str +
            (taskStats.defWeight / 100) * gangMember.def +
            (taskStats.dexWeight / 100) * gangMember.dex +
            (taskStats.agiWeight / 100) * gangMember.agi +
            (taskStats.chaWeight / 100) * gangMember.cha;
        statWeight -= 3.5 * taskStats.difficulty;
        if (statWeight <= 0) return 0;
        const territoryMult = Math.max(
            0.005,
            Math.pow(gangInfo.territory * 100, taskStats.territory.wanted) /
                100,
        );
        if (isNaN(territoryMult) || territoryMult <= 0) return 0;
        if (taskStats.baseWanted < 0) {
            return 0.4 * taskStats.baseWanted * statWeight * territoryMult;
        }
        const calc =
            (7 * taskStats.baseWanted) /
            Math.pow(3 * statWeight * territoryMult, 0.8);

        // Put an arbitrary cap on this to prevent wanted level from rising too fast if the
        // denominator is very small. Might want to rethink formula later
        return Math.min(100, calc);
    }

    public static calculateMoneyGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
        gangInfo: GangGenInfo,
    ): number {
        if (taskStats.baseMoney === 0) return 0;
        let statWeight =
            (taskStats.hackWeight / 100) * gangMember.hack +
            (taskStats.strWeight / 100) * gangMember.str +
            (taskStats.defWeight / 100) * gangMember.def +
            (taskStats.dexWeight / 100) * gangMember.dex +
            (taskStats.agiWeight / 100) * gangMember.agi +
            (taskStats.chaWeight / 100) * gangMember.cha;

        statWeight -= 3.2 * taskStats.difficulty;
        if (statWeight <= 0) return 0;
        const territoryMult = Math.max(
            0.005,
            Math.pow(gangInfo.territory * 100, taskStats.territory.money) / 100,
        );
        if (isNaN(territoryMult) || territoryMult <= 0) return 0;
        const respectMult = gangInfo.wantedPenalty;
        const territoryPenalty = (0.2 * gangInfo.territory + 0.8) * 1;
        return Math.pow(
            5 * taskStats.baseMoney * statWeight * territoryMult * respectMult,
            territoryPenalty,
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

    public static calculateSkillDeltas(gangMember: GangMemberInfo): {
        hack: number;
        str: number;
        def: number;
        dex: number;
        agi: number;
        cha: number;
    } {
        return {
            hack:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.hack_exp + 1,
                    gangMember.hack_mult * gangMember.hack_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.hack_exp,
                        gangMember.hack_mult * gangMember.hack_asc_mult,
                    ) -
                1,
            str:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.str_exp + 1,
                    gangMember.str_mult * gangMember.str_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.str_exp,
                        gangMember.str_mult * gangMember.str_asc_mult,
                    ) -
                1,
            def:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.def_exp + 1,
                    gangMember.def_mult * gangMember.def_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.def_exp,
                        gangMember.def_mult * gangMember.def_asc_mult,
                    ) -
                1,
            dex:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.dex_exp + 1,
                    gangMember.dex_mult * gangMember.dex_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.dex_exp,
                        gangMember.dex_mult * gangMember.dex_asc_mult,
                    ) -
                1,
            agi:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.agi_exp + 1,
                    gangMember.agi_mult * gangMember.agi_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.agi_exp,
                        gangMember.agi_mult * gangMember.agi_asc_mult,
                    ) -
                1,
            cha:
                GangUtilityFunctions.calculateSkillSoft(
                    gangMember.cha_exp + 1,
                    gangMember.cha_mult * gangMember.cha_asc_mult,
                ) /
                    GangUtilityFunctions.calculateSkillSoft(
                        gangMember.cha_exp,
                        gangMember.cha_mult * gangMember.cha_asc_mult,
                    ) -
                1,
        };
    }

    public static calculateSkillSoft(exp: number, mult = 1): number {
        return Math.max(mult * (32 * Math.log(exp + 534.5) - 200), 1);
    }

    public static calculateInvertedSoftSkill(skill: number, mult = 1): number {
        return Math.exp((skill / mult + 200) / 32) - 534.5;
    }

    public static calculateAscensionDeltas(gangMember: GangMemberInfo): {
        hack: number;
        str: number;
        def: number;
        dex: number;
        agi: number;
        cha: number;
    } {
        return {
            hack:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.hack_exp + gangMember.hack_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.hack_exp + gangMember.hack_asc_points,
                    ) -
                1,
            str:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.str_exp + gangMember.str_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.str_exp + gangMember.str_asc_points,
                    ) -
                1,
            def:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.def_exp + gangMember.def_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.def_exp + gangMember.def_asc_points,
                    ) -
                1,
            dex:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.dex_exp + gangMember.dex_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.dex_exp + gangMember.dex_asc_points,
                    ) -
                1,
            agi:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.agi_exp + gangMember.agi_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.agi_exp + gangMember.agi_asc_points,
                    ) -
                1,
            cha:
                GangUtilityFunctions.calculateAscensionMult(
                    gangMember.cha_exp + gangMember.cha_asc_points + 1,
                ) /
                    GangUtilityFunctions.calculateAscensionMult(
                        gangMember.cha_exp + gangMember.cha_asc_points,
                    ) -
                1,
        };
    }

    public static calculateAscensionValue(
        ns: NS,
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
    ): number {
        const multi = //only care about combat stats
            (GangUtilityFunctions.calculateAscensionMult(
                gangMember.str_exp + gangMember.str_asc_points - 1_000,
            ) /
                gangMember.str_asc_mult -
                1 +
                (GangUtilityFunctions.calculateAscensionMult(
                    gangMember.def_exp + gangMember.def_mult - 1_000,
                ) /
                    gangMember.def_asc_mult -
                    1) +
                (GangUtilityFunctions.calculateAscensionMult(
                    gangMember.dex_exp + gangMember.dex_mult - 1_000,
                ) /
                    gangMember.dex_asc_mult -
                    1) +
                (GangUtilityFunctions.calculateAscensionMult(
                    gangMember.agi_exp + gangMember.agi_mult - 1_000,
                ) /
                    gangMember.agi_asc_mult -
                    1)) /
                4 +
            1;
        const expMulti = 1 / ((25 / 1500) * Math.pow(100, 0.9));
        const avgTime =
            (GangUtilityFunctions.calculateInvertedSoftSkill(
                gangMember.str,
                multi * gangMember.str_asc_mult * gangMember.str_mult,
            ) /
                (multi * gangMember.str_asc_mult * expMulti) +
                GangUtilityFunctions.calculateInvertedSoftSkill(
                    gangMember.def,
                    multi * gangMember.def_asc_mult * gangMember.def_mult,
                ) /
                    (multi * gangMember.def_asc_mult * expMulti) +
                GangUtilityFunctions.calculateInvertedSoftSkill(
                    gangMember.dex,
                    multi * gangMember.dex_asc_mult * gangMember.dex_mult,
                ) /
                    (multi * gangMember.dex_asc_mult * expMulti) +
                GangUtilityFunctions.calculateInvertedSoftSkill(
                    gangMember.agi,
                    multi * gangMember.agi_asc_mult * gangMember.agi_mult,
                ) /
                    (multi * gangMember.agi_asc_mult * expMulti)) /
            4;

        if (
            (gangInfo.respect - gangMember.earnedRespect) /
                (gangInfo.respect -
                    gangMember.earnedRespect +
                    gangInfo.wantedLevel) <
            0.5
        ) {
            return 0;
        }

        ns.tprint(avgTime);
        if (multi <= 0 || avgTime <= 0) return 0;
        //ns.tprint(
        //    `Ascension: ${multi} / ${cost} ... ${GangUtilityFunctions.calculateAscensionMult(
        //        gangMember.dex_exp + gangMember.dex_mult - 1_000,
        //    )} ${gangMember.dex_exp + gangMember.dex_mult - 1_000}`,
        //);

        return Math.log1p(multi) / (avgTime + 0.01);
    }

    public static calculateAscensionMult(points: number): number {
        if (points < 0) return -1;
        return Math.max(Math.pow(points / 2000, 0.5), 1);
    }

    public static getPowerGain(
        gangMember: GangMemberInfo,
        taskStats: GangTaskStats,
    ): number {
        if (taskStats.name != 'Territory Warfare') return 0;
        return (
            (((0.015 * 1.0) / 7.0) *
                (gangMember.hack +
                    gangMember.str +
                    gangMember.def +
                    gangMember.dex +
                    gangMember.agi)) /
            95 /
            100 // 100 cycles per update
        );
    }

    /**
     * Calculates the death rate, currently 0 as we don't want to pull out early
     * @param gangMember
     * @param gangInfo
     * @returns Expected death cost from one tick of death chance
     */
    public static getDeathRisk(
        gangMember: GangMemberInfo,
        gangInfo: GangGenInfo,
    ): number {
        return 0;
        if (!gangInfo.territoryWarfareEngaged) return 0;
        const chance = 0.02 / Math.pow(gangMember.def, 0.6);
        const avg = //only care about combat stats
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

    public static bestUpgrade(
        ns: NS,
        gangMember: GangMemberInfo,
    ): { name: string; value: number; cost: number } {
        return ns.gang.getEquipmentNames().reduce(
            (best, name) => {
                if (gangMember.upgrades.includes(name)) return best;

                const cost = ns.gang.getEquipmentCost(name);
                const stats = ns.gang.getEquipmentStats(name);
                const sum =
                    (stats.hack ? (stats.hack - 1) * gangMember.hack : 0) +
                    (stats.str ? (stats.str - 1) * gangMember.str : 0) +
                    (stats.def ? (stats.def - 1) * gangMember.def : 0) +
                    (stats.dex ? (stats.dex - 1) * gangMember.dex : 0) +
                    (stats.agi ? (stats.agi - 1) * gangMember.agi : 0) +
                    (stats.cha ? (stats.cha - 1) * gangMember.cha : 0);
                const effect =
                    sum /
                    (gangMember.hack +
                        gangMember.str +
                        gangMember.def +
                        gangMember.dex +
                        gangMember.agi +
                        gangMember.cha);
                const value = Math.log1p(effect) / cost;
                if (value > best.value) {
                    return { name: name, value: value, cost: cost };
                } else {
                    return best;
                }
            },
            { name: 'None', value: 0, cost: 1e10 },
        );
    }

    /**
     * Estimates the percentage of time that will be spent doing stuff
     * that depends on respectuation, money, or wanted
     * Informs us how to weigh the value of those tasks
     */
    public static getEstimatedBuildUpPortion(gangInfo: GangGenInfo): number {
        return gangInfo.territory === 1 ? 0.9 : 0.5;
    }

    public static getPowerTarget(ns: NS): number {
        const highestGang = Math.max(
            ...Object.values(ns.gang.getOtherGangInformation()).map(
                (g) => g.power,
            ),
        );
        return Math.max(
            highestGang * 2,
            targetGangWinPower,
            ns.gang.getGangInformation().power * 1.1,
        );
    }
}
