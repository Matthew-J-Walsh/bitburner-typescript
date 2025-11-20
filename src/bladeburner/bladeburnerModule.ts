import {
    BladeburnerActionName,
    BladeburnerActionType,
    CityName,
    NS,
} from '@ns';
import { Cities } from '/bladeburner/constants';

/**
 * ### BladeburnerModule Uniqueness
 * This modules handles the full managment bladeburner
 */
export class BladeburnerModule {
    nextLog: number = 0;
    cityDirection: Map<CityName, number> = new Map<CityName, number>();
    lastFieldAnalysisEst: number | undefined = undefined;

    constructor(protected ns: NS) {}

    manage(): any {
        // -2. Finish analysis
        if (this.lastFieldAnalysisEst) {
            const city = this.ns.bladeburner.getCity();
            const endEst = this.ns.bladeburner.getCityEstimatedPopulation(city);
            if (this.lastFieldAnalysisEst === endEst)
                this.cityDirection.set(city, 0);
            else if (this.lastFieldAnalysisEst > endEst)
                this.cityDirection.set(city, -1);
            else this.cityDirection.set(city, 1);
            this.lastFieldAnalysisEst = undefined;
        }

        // -1. Upgrade skills
        this.upgradeSkills();

        // 0. Log
        if (Date.now() > this.nextLog) {
            this.log();
            this.nextLog = Date.now() + 120_000;
        }

        // 1. Gain stamina if not above 50%
        const [stamina, maxStamina] = this.ns.bladeburner.getStamina();
        if (stamina < maxStamina * 0.5)
            return this.ns.bladeburner.startAction(
                'General',
                'Hyperbolic Regeneration Chamber',
            );

        // 2. Do black op if its 100%
        const blackOp = this.ns.bladeburner.getNextBlackOp()!;
        if (blackOp.rank > this.ns.bladeburner.getRank())
            if (
                this.attemptToStartStochasticAction(
                    'Black Operations',
                    blackOp.name,
                )
            )
                return;

        // 3. Do an operation if 100%
        const operations = this.ns.bladeburner.getOperationNames().reverse();
        for (let op of operations)
            if (this.attemptToStartStochasticAction('Operations', op)) return;

        // 4. Do a contract if 100%
        const contracts = this.ns.bladeburner.getContractNames().reverse();
        for (let con of contracts)
            if (this.attemptToStartStochasticAction('Contracts', con)) return;

        // 5. Do Recruitment below some charisma exp (this shit gives like 2k exp per second or something)
        const player = this.ns.getPlayer();
        if (player.exp.charisma / player.mults.charisma_exp < 1e5)
            return this.ns.bladeburner.startAction('General', 'Recruitment');

        // 6. Do diplomacy if some place has high chaos
        for (let city in Cities) {
            if (this.ns.bladeburner.getCityChaos(city as CityName) > 45) {
                this.ns.bladeburner.switchCity(city as CityName);
                this.ns.bladeburner.startAction('General', 'Diplomacy');
            }
        }

        // 7. Use field analysis to populate cityRatios
        for (let city in Cities)
            if (!this.cityDirection.get(city as CityName))
                return this.startFieldAnalysis(city as CityName);

        // 8. Spam field analysis on the city with the highest estimate going upward
        let bestCity: CityName = 'Aevum' as CityName;
        let bestCityEst: number = 0;
        for (let city in Cities) {
            if (this.cityDirection.get(city as CityName)! === 1) {
                if (
                    this.ns.bladeburner.getCityEstimatedPopulation(
                        city as CityName,
                    ) > bestCityEst
                ) {
                    bestCity = city as CityName;
                    bestCityEst =
                        this.ns.bladeburner.getCityEstimatedPopulation(
                            city as CityName,
                        );
                }
            }
        }

        if (bestCityEst !== 0) return this.startFieldAnalysis(bestCity);

        // 9. Spam field analysis on a city that isn't fully estimated
        for (let city in Cities)
            if (this.cityDirection.get(city as CityName)! !== 0)
                return this.startFieldAnalysis(city as CityName);

        // 10. Training
        return this.ns.bladeburner.startAction('General', 'Training');
    }

    /**
     * Attempt to start a Stochastic action, refuses to start if the success chance is below 100%
     * @param type
     * @param name
     * @returns true if started, else false
     */
    attemptToStartStochasticAction(
        type:
            | BladeburnerActionType
            | 'General'
            | 'Contracts'
            | 'Operations'
            | 'Black Operations',
        name: BladeburnerActionName,
    ): boolean {
        if (type === 'Contracts' || type === 'Operations') {
            this.ns.bladeburner.setActionLevel(
                type,
                name,
                this.ns.bladeburner.getActionMaxLevel(type, name),
            );
            this.ns.bladeburner.setActionAutolevel(type, name, true);
        }
        for (let city in Cities) {
            this.ns.bladeburner.switchCity(city as CityName);
            if (
                this.ns.bladeburner.getActionEstimatedSuccessChance(
                    type,
                    name,
                )[0] === 1
            ) {
                this.ns.bladeburner.startAction(type, name);
                return true;
            }
        }
        return false;
    }

    /**
     * Starts field analysis targeting a city and tracking the estimate direction
     * @param city
     */
    startFieldAnalysis(city: CityName) {
        this.ns.bladeburner.switchCity(city);
        this.lastFieldAnalysisEst =
            this.ns.bladeburner.getCityEstimatedPopulation(city as CityName);
        this.ns.bladeburner.startAction('General', 'Field Analysis');
    }

    /**
     * Upgrades the best skill at the moment
     */
    upgradeSkills() {}

    log() {}
}
