import { Server } from '@ns';

//TODO:
export type Time = number;
export type ProcessID = number;
export type Threads = number;

/** Prefix for purchased servers */
export const purchasedServerPrefix = 'pserv';

/** Minimal time allowed between experience batches targeting the same target per pair TODO */
export const minimalTimeBetweenTwoScriptsEnding = 2000;
/** Default delay for hacking priority returns */
export const maxPeriodForHackingSchedulingFunctions = 5_000;
/** Time to wait if we aren't at minimum security */
export const backupSecurityFailureSchedulingDelay = 5;

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
/** Type for strings related to hacking scripts */
export type HackScriptType = 'hack' | 'grow' | 'weaken';
/** Iterable for possible HackScriptTypes */
export const hackScriptTypes = ['hack', 'grow', 'weaken'] as HackScriptType[];
export type LoopedScriptType = 'weakenLooped' | 'share' | 'stanek';
export type HackScriptRuntimes = { hack: Time; grow: Time; weaken: Time };

export type HackingPolicy = {
    /** Home for do nothing */
    target: Server;
    spacing: number;
    /** Empty for weaken */
    sequence: HackingScript[];
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
export type HackingScript = {
    script: HackScriptType;
    threads: Threads;
};

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
    grow: 1.75,
    weaken: 1.75,
};
export const scriptAvgCosts = {
    hack: (1.7 * 1.0) / 4.0,
    grow: (1.75 * 3.2) / 4.0,
    weaken: 1.75,
};
export const minimumAllowableBatchRam = growScriptSize + weakenScriptSize;
