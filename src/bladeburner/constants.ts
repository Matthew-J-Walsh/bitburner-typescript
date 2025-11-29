import { BladeburnerActionName, BladeburnerActionType, CityName } from '@ns';

//
export const Cities: (
    | CityName
    | 'Aevum'
    | 'Chongqing'
    | 'Sector-12'
    | 'New Tokyo'
    | 'Ishima'
    | 'Volhaven'
)[] = ['Aevum', 'Chongqing', 'Sector-12', 'New Tokyo', 'Ishima', 'Volhaven'];

export const minimalSuccessChance = 0.7;

//

//

/**export type BladeBurnerAction = {
    baseDifficulty: number;
    rankGain: number;
    rankLoss: number;
    hpLoss: number;
    isStealth: boolean;
    isKill: boolean;
    weights: {
        hacking: number,
        strength: number,
        defense: number,
        dexterity: number,
        agility: number,
        charisma: number,
        intelligence: number,
    };
    decays: {
        hacking: number,
        strength: number,
        defense: number,
        dexterity: number,
        agility: number,
        charisma: number,
        intelligence: number,
    };
    difficultyFac: number;
    rewardFac: number;
}*/
