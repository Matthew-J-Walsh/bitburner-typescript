import { CompanyName, CrimeType, FactionName, JobField } from '@ns';

export const defaultSleepTime = 60_000;

export const multipleAugMultiplier = 1.9; //BN11

export const startUpScript = 'start.js';

export type Check = () => boolean;
export type Action = () => Promise<void>;

export type SkillName =
    | 'agility'
    | 'charisma'
    | 'defense'
    | 'dexterity'
    | 'hacking'
    | 'strength';

export const CrimeTimes: Record<CrimeType, number> = {
    Shoplift: 2e3,
    'Rob Store': 60e3,
    Mug: 4e3,
    Larceny: 90e3,
    'Deal Drugs': 10e3,
    'Bond Forgery': 300e3,
    'Traffick Arms': 40e3,
    Homicide: 3e3,
    'Grand Theft Auto': 80e3,
    Kidnap: 120e3,
    Assassination: 300e3,
    Heist: 600e3,
};

export interface FactionReset {
    type: 'faction';
    faction: FactionName;
    augments: string[];
    favor: number;
}

export interface NeuroFluxReset {
    type: 'neuroflux';
    target: number;
    count?: number;
    faction?: FactionName;
}

export interface CompanyPartialReset {
    type: 'company';
    companyName: CompanyName;
    field: JobField;
}

export interface GraftingReset {
    type: 'grafting';
    augName: string;
}

export interface GraftingPartialReset {
    type: 'graftingP';
    augName: string;
}

export type PartialReset =
    | CompanyPartialReset
    | GraftingPartialReset
    | FactionReset;

export interface PiecewiseReset {
    type: 'piecewise';
    partials: PartialReset[];
    reset: boolean;
}

export type Reset =
    | NeuroFluxReset
    | FactionReset
    | GraftingReset
    | PiecewiseReset;
