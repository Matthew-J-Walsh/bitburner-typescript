import { GangMemberInfo, NS } from '@ns';
import { GangUtilityFunctions } from './gangUtilityModule';
import { randomString } from '/gang/constants';
import { PurchaseEvaluation } from '/core/money/moneyModule';
import { LoggingUtility } from '/lib/loggingUtils';

/**
 * ### GangModule Uniqueness
 * This modules handles the full managment of the gang
 */
export class GangModule {
    /** When to trigger the next log */
    nextLog: number = 0;
    /** Logger */
    logger!: LoggingUtility;
    /** Log storage */
    logInfo: Record<string, any> = {};
    /** Estimated amount of respect gained, needed because no singularity to check repuation */
    resEstimate: number = 0;
    /** Memory for the respect to calculate gain via difference */
    resMem: number = 0;

    constructor(protected ns: NS) {
        this.logger = new LoggingUtility(ns, 'gang', this.log.bind(this));
        if (!this.ns.gang.inGang()) this.ns.gang.createGang('Slum Snakes');
        if (this.ns.gang.inGang()) {
            this.resMem = this.ns.gang.getGangInformation().respect;
        }
    }

    /** Primary management function, updates the gang members tasks */
    manage(): void {
        const startTime = Date.now();
        while (this.ns.gang.canRecruitMember())
            this.ns.gang.recruitMember(randomString(10));

        const gangInfo = this.ns.gang.getGangInformation();
        this.logInfo['gangInfo'] = gangInfo;
        this.resEstimate += gangInfo.respect - this.resMem;
        this.resMem = gangInfo.respect;

        const otherGangInfo = this.ns.gang.getOtherGangInformation();
        this.logInfo['otherGangInfo'] = otherGangInfo;

        const gangMembers = this.ns.gang
            .getMemberNames()
            .map((name) => this.ns.gang.getMemberInformation(name));

        const bestUpgrade = this.bestUpgrade;
        const bestUpgradeValue =
            bestUpgrade.cost < this.ns.getPlayer().money
                ? bestUpgrade.value
                : 0;
        this.logInfo['bestUpgrade'] = bestUpgrade;
        this.logInfo['members'] = {};

        let territoryCleanup =
            Math.max(
                ...Object.entries(otherGangInfo).map(([name, info]) =>
                    name === gangInfo.faction ? 0 : info.power,
                ),
            ) <=
                gangInfo.power / 25 && gangInfo.territory !== 1;
        let oneFighting = !territoryCleanup;

        gangMembers.forEach((gangMember: GangMemberInfo) => {
            let weights: {
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
            };
            if (gangInfo.territory !== 1 && !territoryCleanup) {
                const powerRemaining =
                    (GangUtilityFunctions.getPowerTarget(this.ns) -
                        gangInfo.power) /
                    (this.ns.gang.getMemberNames().length + 0.01);
                weights = GangUtilityFunctions.getStage0Weights(
                    this.ns,
                    powerRemaining,
                    gangMember,
                    gangInfo,
                    bestUpgradeValue,
                    gangMembers.length,
                );
            } else {
                weights = GangUtilityFunctions.getStage1Weights(
                    this.ns,
                    this.respectRemaining,
                    this.moneyRemaining,
                    gangMember,
                    gangInfo,
                    bestUpgradeValue,
                    gangMembers.length,
                );
            }
            const taskValues = Object.fromEntries(
                this.ns.gang.getTaskNames().map((taskname: string) => {
                    const taskStats = this.ns.gang.getTaskStats(taskname);
                    return [
                        taskname,
                        GangUtilityFunctions.evaluateTask(
                            this.ns,
                            gangMember,
                            taskStats,
                            gangInfo,
                            weights,
                        ),
                    ];
                }),
            );
            taskValues['Ascend'] = GangUtilityFunctions.calculateAscensionValue(
                this.ns,
                gangMember,
                gangInfo,
            );
            const bestTask = Object.entries(taskValues).reduce(
                (best, [key, value]) => (value > taskValues[best] ? key : best),
                'Ascend',
            );
            if (!oneFighting) {
                this.setTask(gangMember.name, 'Territory Warfare');
                oneFighting = true;
            } else {
                this.setTask(gangMember.name, bestTask);
            }

            this.logInfo['members'][gangMember.name] = {
                weights: weights,
                tasks: taskValues,
                bestTask: bestTask,
            };
        });

        if (
            Math.max(
                ...Object.values(otherGangInfo).map((info) => info.power),
            ) <= gangInfo.power &&
            gangInfo.power > 100
        ) {
            if (!gangInfo.territoryWarfareEngaged)
                this.ns.tprint(
                    'We are dominating! Turning on territory warfare',
                );
            this.ns.gang.setTerritoryWarfare(true);
        }

        if (Date.now() > this.nextLog) {
            this.logger.logToFile();
            this.nextLog = Date.now() + 120_000;
        }
    }

    /**
     * Helper to set the task with Ascensions
     * @param member
     * @param task
     */
    private setTask(member: string, task: string) {
        //this.ns.tprint(`Assigning ${member} to ${task}`);
        if (task == 'Ascend') {
            this.ns.gang.ascendMember(member);
            this.resMem = this.ns.gang.getGangInformation().respect; // We lost respect, update memory
            this.ns.gang.setMemberTask(member, 'Train Combat');
        } else {
            this.ns.gang.setMemberTask(member, task);
        }
    }

    /** The best upgrade avaiable to our gang */
    private get bestUpgrade(): {
        member: string;
        name: string;
        value: number;
        cost: number;
        effect: number;
    } {
        if (!this.ns.gang.inGang())
            return {
                member: 'not in gang',
                name: 'not in gang',
                value: 0,
                cost: 1e99,
                effect: 0,
            };
        const gangMembers = this.ns.gang
            .getMemberNames()
            .map((name) => this.ns.gang.getMemberInformation(name));
        return gangMembers.reduce(
            (best, gangMember: GangMemberInfo) => {
                const upgrade = GangUtilityFunctions.bestUpgrade(
                    this.ns,
                    gangMember,
                );
                if (upgrade.value > best.value) {
                    return { ...{ member: gangMember.name }, ...upgrade };
                } else {
                    return best;
                }
            },
            {
                ...{ member: gangMembers[0].name },
                ...GangUtilityFunctions.bestUpgrade(this.ns, gangMembers[0]),
            },
        );
    }

    /**
     * Best upgrade externally (for money generation).
     * TODO: We do something weird here, where we rank purchases by a fixed formula but return the effect
     */
    get bestUpgradeExternal(): PurchaseEvaluation {
        let bestUpgrade = this.bestUpgrade;
        let income = this.ns.formulas.gang.moneyGain(
            this.ns.gang.getGangInformation(),
            this.ns.gang.getMemberInformation(bestUpgrade.member),
            this.ns.gang.getTaskStats('Human Trafficking'),
        ); //TODO, do we need a multiplier?
        return {
            income: income * this.bestUpgrade.effect,
            cost: bestUpgrade.cost,
            buy: () =>
                this.ns.gang.purchaseEquipment(
                    bestUpgrade.member,
                    bestUpgrade.name,
                ),
        };
    }

    /** Temporary before singularity: how much respect to obtain */
    private get respectRemaining(): number {
        const target = 0.5e6; //2.5e6 is red pill
        const favor = 0;

        return target * (100 / (100 + favor)) * 1.1 * 75 - this.resEstimate;
    }

    /** Temporary before singularity: how much money to obtain */
    private get moneyRemaining(): number {
        return this.ns.getPlayer().money * 1.1 + 1e9;
    }

    public log(): Record<string, any> {
        return {
            ...this.logInfo,
            ...{
                resEstimate: this.resEstimate,
                respectRemaining: this.respectRemaining,
                moneyRemaining: this.moneyRemaining,
            },
        };
    }
}
