import { GangMemberInfo, NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { GangUtilityFunctions } from './gangUtilityModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';
import { randomString } from './constants';

/**
 * ### GangModule Uniqueness
 * This modules handles the full managment of the gang
 */
export class GangModule extends BaseModule {
    /** What stage the gang is in, territory === 1 */
    stage: number = 0;
    /** Log storage */
    logInfo: Record<string, any> = {};
    /** Estimated amount of respect gained, needed because no singularity to check repuation */
    resEstimate: number = 0;
    /** Memory for the respect to calculate gain via difference */
    resMem: number = 0;

    constructor(protected ns: NS) {
        super(ns);
        if (!this.ns.gang.inGang()) this.ns.gang.createGang('Slum Snakes');
        if (this.ns.gang.inGang()) {
            this.resMem = this.ns.gang.getGangInformation().respect;
            if (this.ns.gang.getGangInformation().territory === 1)
                this.stage = 1;
        }
    }

    public registerBackgroundTasks(): BackgroundTask[] {
        return [
            {
                name: 'GangModule.manageStage1',
                fn: this.manageStage1.bind(this),
                nextRun: 0,
                interval: 10_000,
            },
        ];
    }

    public registerPriorityTasks(): PriorityTask[] {
        return [
            {
                name: 'GangModule.manageStage0',
                fn: this.manageStage0.bind(this),
                nextRun: 0,
            },
        ];
    }

    /** Primary management function, updates the gang members tasks */
    private manage(): number {
        if (!this.ns.gang.inGang()) {
            if (!this.ns.gang.createGang('Slum Snakes')) {
                return Date.now() + 10_000;
            }
        }

        const startTime = Date.now();
        while (this.ns.gang.canRecruitMember())
            this.ns.gang.recruitMember(randomString(10));

        const gangInfo = this.ns.gang.getGangInformation();
        this.logInfo['gangInfo'] = gangInfo;
        this.resEstimate += gangInfo.respect - this.resMem;
        this.resMem = gangInfo.respect;

        if (gangInfo.territory === 1) this.stage = 1;

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
            if (this.stage === 0) {
                const powerRemaining =
                    GangUtilityFunctions.getPowerTarget(this.ns) -
                    gangInfo.power;
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
            this.setTask(gangMember.name, bestTask);

            this.logInfo['members'][gangMember.name] = {
                weights: weights,
                tasks: taskValues,
                bestTask: bestTask,
            };
        });
        this.ns.tprint(`Took ${Date.now() - startTime}ms to process gang`);
        //this.ns.tprint(
        //    `${JSON.stringify(GangUtilityFunctions.calculateAscensionDeltas(gangMembers[0]))}`,
        //);
        //this.ns.tprint(
        //    `${JSON.stringify(GangUtilityFunctions.calculateSkillDeltas(gangMembers[4]))}`,
        //);
        //this.ns.tprint(
        //    0.3 / (gangInfo.respectForNextRecruit - gangInfo.respect),
        //);
        //this.ns.tprint(-1 / (gangInfo.respect + gangInfo.wantedLevel + 100));
        /** this.ns.tprint(
            GangUtilityFunctions.getPowerGain(
                gangMembers[0],
                this.ns.gang.getTaskStats('Territory Warfare'),
            ),
        );*/
        if (
            Math.max(
                ...Object.values(otherGangInfo).map((info) => info.power),
            ) <= gangInfo.power
        ) {
            if (!gangInfo.territoryWarfareEngaged)
                this.ns.tprint(
                    'We are dominating! Turning on territory warfare',
                );
            this.ns.gang.setTerritoryWarfare(true);
        }

        return Date.now() + (this.ns.gang.getBonusTime() > 0 ? 4_000 : 10_000); //I dont fucking know dude
    }

    /** A prioirty task until we have full territory */
    manageStage0(): number {
        if (this.stage === 1) return Date.now() + 100_000;
        return this.manage();
    }

    /** A background task after speed matters less */
    manageStage1(): number {
        if (this.stage === 0) return Date.now() + 100_000;
        return this.manage();
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
    } {
        if (!this.ns.gang.inGang())
            return {
                member: 'not in gang',
                name: 'not in gang',
                value: 0,
                cost: 1e99,
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
     * Best upgrade externally, the value is only 1/2th of what is claimed.
     * TODO: Money integration
     */
    get bestUpgradeExternal(): {
        member: string;
        name: string;
        value: number;
        cost: number;
    } {
        let bestUpgrade = this.bestUpgrade;
        bestUpgrade.value /= 12;
        return bestUpgrade;
    }

    /** Temporary before singularity: how much respect to obtain */
    private get respectRemaining(): number {
        const target = 5e5; //2.5e6 is red pill
        const favor = 0;

        return target * (100 / (100 + favor)) * 1.1 * 75 - this.resEstimate;
    }

    /** Temporary before singularity: how much money to obtain */
    private get moneyRemaining(): number {
        return this.ns.getPlayer().money * 2 + 1e10;
    }

    public log(): Record<string, any> {
        return {
            ...this.logInfo,
            ...{
                stage: this.stage,
                resEstimate: this.resEstimate,
                respectRemaining: this.respectRemaining,
                moneyRemaining: this.moneyRemaining,
            },
        };
    }
}
