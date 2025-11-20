import {
    BladeburnerActionName,
    BladeburnerActionType,
    BladeburnerContractName,
    BladeburnerOperationName,
    CityName,
    NS,
} from '@ns';
import { ActionTypes } from './constants';

/**
 * ### BladeBurnerUtilityModule Uniqueness
 * This modules handles calculations for bladeburner
 * Also tracks population sizes from some tech: We can do this whenever we run an operation that updates the population size by a percent
 * We can do this with field analysis
 */
export class BladeBurnerUtilityModule {
    ns!: NS;
    cityPops: Map<CityName, number> = new Map<CityName, number>();

    public evaluateAction(
        action: BladeburnerActionName,
        city: CityName,
        level?: number,
        sleeveNumber?: number,
    ): number {
        if (action === 'Training')
            return this.getExpectedTrainingValue(sleeveNumber);
        if (action === 'Hyperbolic Regeneration Chamber') return 1;
        const [type, name] = this.getAction(action);

        const rankGain = this.getExpectedRankGain(
            action,
            city,
            level,
            sleeveNumber,
        );
        let time = this.ns.bladeburner.getActionTime(type, name);
        time += this.getStaminaCost(action, city, level, sleeveNumber);
        time += this.getContractCost(action, city);
        return rankGain / time;
    }

    /**
     * Calculates the expected rank gain multiplied by something,
     * We only ever compare this value to training exp so we don't particularly care
     * Where we do that math
     * @param this.ns
     * @param action
     * @param level
     * @param sleeveNumber
     * @returns
     */
    public getExpectedRankGain(
        action: BladeburnerActionName,
        city: CityName,
        level?: number,
        sleeveNumber?: number,
    ): number {
        const [type, name] = this.getAction(action);
        let oldLevel;
        if (level) {
            oldLevel = this.ns.bladeburner.getActionCurrentLevel(type, name);
            this.ns.bladeburner.setActionLevel(type, name, level);
        }

        const successChance = this.getActionSuccessChance(
            action,
            city,
            sleeveNumber,
        );
        const rankGain = this.ns.bladeburner.getActionRepGain(
            type,
            name,
            this.ns.bladeburner.getActionCurrentLevel(type, name),
        );

        if (level) this.ns.bladeburner.setActionLevel(type, name, oldLevel!);

        return rankGain * ((11 / 10) * successChance - 1 / 10);
    }

    /**
     * Wrapper, returns the midpoint for now
     * @param this.ns
     * @param action
     * @param sleeveNumber
     * @returns
     */
    public getActionSuccessChance(
        action: BladeburnerActionName,
        city: CityName,
        sleeveNumber?: number,
    ): number {
        const [type, name] = this.getAction(action);
        const [low, high] = this.ns.bladeburner.getActionEstimatedSuccessChance(
            type,
            name,
            sleeveNumber,
        );
        const r =
            this.cityPops.get(city)! /
            this.ns.bladeburner.getCityEstimatedPopulation(city);
        // we can only guess rn
        if (r < 1) return Math.max(high * Math.pow(r, 0.7), 0);
        else return Math.min(low * Math.pow(r, 0.7), 1);
    }

    public getExpectedTrainingValue(sleeveNumber?: number): number {
        const getSoftLevel = (exp: number, mult: number) =>
            Math.floor(mult * (32 * Math.log(exp + 534.6) - 200));
        const getLevelScaling = (level: number) => level;
        const getExpValue = (exp: number, mult: number) =>
            getLevelScaling(getSoftLevel(exp + 1, mult)) /
            getLevelScaling(getSoftLevel(exp, mult));

        //const unit = !sleeveNumber ? this.ns.getPlayer() : this.ns.sleeve.getSleeve(sleeveNumber);
        const unit = this.ns.getPlayer();
        const value =
            getExpValue(unit.exp.strength, unit.mults.strength) +
            getExpValue(unit.exp.defense, unit.mults.defense) +
            getExpValue(unit.exp.dexterity, unit.mults.dexterity) +
            getExpValue(unit.exp.agility, unit.mults.agility);
        const rankAntiMulti =
            0.2 * 30 * 2 * this.ns.getPlayer().mults.faction_rep; // * this.ns.singularity.getFactionFavor("Bladeburners")
        return value * rankAntiMulti;
    }

    public getActionType(
        action: BladeburnerActionName,
    ): [
        (
            | BladeburnerActionType
            | 'General'
            | 'Contracts'
            | 'Operations'
            | 'Black Operations'
        ),
        BladeburnerActionName | `${BladeburnerActionName}`,
    ] {
        return [ActionTypes[action], action as BladeburnerActionName];
    }

    public getStaminaCost(
        action: BladeburnerActionName,
        city: CityName,
        level?: number,
        sleeveNumber?: number,
    ): number {
        return 0 * this.getExpectedRankGain(action, city, level, sleeveNumber);
    }

    public getDiplomacyCost(
        action: BladeburnerActionName,
        city: CityName,
    ): number {
        let chaosChange = 0;
        let cityChaos = this.ns.bladeburner.getCityChaos(city);
        switch (action) {
            case 'Incite Violence':
                chaosChange = 10 + cityChaos / Math.log10(cityChaos);
                break;
            case 'Sting':
                chaosChange = 0.1;
                break;
            case 'Bounty Hunter':
                chaosChange = 0.02;
                break;
            case 'Retirement':
                chaosChange = 0.04;
                break;
            case 'Raid':
                chaosChange = cityChaos * 0.03;
                break;
            case 'Stealth Retirement':
                chaosChange = cityChaos * -0.02;
                break;
            default:
                break;
        }

        const charisma = this.ns.getPlayer().skills.charisma;
        const change = (Math.pow(charisma, 0.045) + charisma / 1e3) / 100;
        const count = Math.log((50 - chaosChange) / 50) / Math.log(1 - change);
        const time = this.ns.bladeburner.getActionTime('General', 'Diplomacy');
        return count * time;
    }

    /**
     * Gets the depleted cost of an action on contracts
     */
    public getContractCost(
        action: BladeburnerActionName,
        city: CityName,
    ): number {
        if (
            this.ns.bladeburner
                .getContractNames()
                .includes(action as BladeburnerContractName) ||
            this.ns.bladeburner
                .getOperationNames()
                .includes(action as BladeburnerOperationName)
        ) {
            const [type, name] = this.getAction(action);
            return (
                (this.getIndividualContractCost(city) * 1) /
                Math.max(
                    this.ns.bladeburner.getActionCountRemaining(type, name),
                    1,
                )
            );
        }

        return 0;
    }

    public getIndividualContractCost(city: CityName): number {
        let time = this.ns.bladeburner.getActionTime(
            'General',
            'Incite Violence',
        );
        time += this.getDiplomacyCost('Incite Violence', city);
        // We guess its one of the later ones: so growth average is 1
        const count = 1 / ((60 * 3 * 1) / 480);
        return time * count;
    }
}
