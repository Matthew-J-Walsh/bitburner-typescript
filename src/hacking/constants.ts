import { Server } from '@ns';

export type Time = number;
export type ProcessID = number;
export type Threads = number;

export type ScriptPortCommunication = {
    script: string;
    expectedDuration: number;
    responsePort?: number;
};

/** Prefix for purchased servers */
export const purchasedServerPrefix = 'pserv';

/** Maximum hacked percent for stability */
export const maximumHackedPercent = 0.9;

/** General script type */
export type ScriptType =
    | 'hack'
    | 'grow'
    | 'weaken'
    | 'weakenLooped'
    | 'share'
    | 'stanek';
/** Mapping of ScriptTypes to their script */
export const scriptMapping = {
    hack: 'scripts/hackScript.js',
    grow: 'scripts/growScript.js',
    weaken: 'scripts/weakenScript.js',
    weakenLooped: 'scripts/weakenLoopedScript.js',
    share: 'scripts/shareScript.js',
    stanek: 'scripts/stanekScript.js',
};
export const coreEffectedScripts: string[] = [
    scriptMapping['grow'],
    scriptMapping['weaken'],
];
/** Type for strings related to hacking scripts */
export type HackScriptType = 'hack' | 'hackF' | 'grow' | 'weaken';
//hackF is a fracturable hack (exp farming)
/** Iterable for possible HackScriptTypes */
export const hackScriptTypes = ['hack', 'grow', 'weaken'] as HackScriptType[];
export type LoopedScriptType = 'weakenLooped' | 'share' | 'stanek';
export interface HackScriptRuntimes {
    hack: Time;
    grow: Time;
    weaken: Time;
}

export type HackingPolicy = {
    /** Home for do nothing */
    target: Server;
    /** Time between hacks */
    spacing: number;
    /** Empty for weaken */
    sequence: HackingScript[];
    /** What script should affect stocks */
    stockScript?: ScriptType;
};

/** Structure of a grow batch */
export const gwStructure: HackScriptType[] = ['grow', 'weaken'];
/** Structure of a money batch */
export const hwgwStructure: HackScriptType[] = [
    'hack',
    'weaken',
    'grow',
    'weaken',
];
/** Structure of a exp batch */
export const hwStructure: HackScriptType[] = ['hack', 'weaken'];

/** Struct for a combined hacking script and its thread count */
export interface HackingScript {
    script: HackScriptType;
    threads: Threads;
}

export const hackScriptSize = 1.7;
export const growScriptSize = 1.75;
export const weakenScriptSize = 1.75;
export const hackFort = 0.002;
export const growFort = 0.004;
export const weakenFort = 0.05;
export const hackAvgCost =
    hackScriptSize + (weakenScriptSize * hackFort) / weakenFort;
export const growAvgCost =
    growScriptSize + (weakenScriptSize * growFort) / weakenFort;
export const scriptCosts = {
    hack: 1.7,
    hackF: 1.7,
    grow: 1.75,
    weaken: 1.75,
};
export const scriptAvgCosts = {
    hack: (1.7 * 1.0) / 4.0,
    grow: (1.75 * 3.2) / 4.0,
    weaken: 1.75,
};
export const minimumAllowableBatchRam =
    2 * growScriptSize +
    weakenScriptSize; /** Holds the information about an actively running script */

export type ActiveScript = {
    /** Hostname the script is running on */
    hostname: string;
    /** Thread count */
    threads: Threads;
    /** How much ram the script uses */
    ramUsage: number;
    /** The expected end time of the script */
    endTime: Time;
    /** Process id of the script */
    pid: ProcessID;
}; /** Holds information about a deadzone (not at minimum security) for hacking a server */

export type Deadzone = {
    /** When the deadzone will start */
    start: Time;
    /** When the deadzone will end */
    end: Time;
};
//Amount of time off a leveling unaffected script can hit, before or after, we need to add in

/** Time difference that we can expect when hitting hacks */
export const targetedTimeVariance: Time = 50;
/** Amount of time between hack windows that we need so that we can safely start runs */
export const hackScriptGap: Time = 100;
/** Delay at the start of a batch to get the scripts going */
export const scriptExpectedDelay: Time = 50;
