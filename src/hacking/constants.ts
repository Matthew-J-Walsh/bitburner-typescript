/** Prefix for purchased servers */
export const purchasedServerPrefix = 'pserv-';

/** Mapping of ScriptTypes to their script */
export const scriptMapping = {
    hack: '/scripts/hackScript.js',
    grow: '/scripts/growScript.js',
    weaken: '/scripts/weakenScript.js',
    weakenLooped: '/scripts/weakenLoopedScript.js',
    share: '/scripts/shareScript.js',
    stanek: '/scripts/stanekScript.js',
};

/** Minimal time allowed between experience batches targeting the same target per pair TODO */
export const minimalTimeBetweenPerPair = 500;
/** Default delay for hacking priority returns */
export const defaultDelay = 5_000;
/** Built in delay between batch starts */
export const batchInternalDelay = 200;
/** Maximum permissible time that a script can end without killing the batch */
export const batchMaximumDelay = 100;
/** Time to wait if we aren't at minimum security */
export const securityFailureWaitTime = 10;

/** Type for strings related to hacking scripts */
export type HackScriptType = 'hack' | 'grow' | 'weaken';
/** Iterable for possible HackScriptTypes */
export const hackScriptTypes = ['hack', 'grow', 'weaken'] as HackScriptType[];
/** General script type */
export type ScriptType =
    | 'hack'
    | 'grow'
    | 'weaken'
    | 'weakenLooped'
    | 'share'
    | 'stanek';

/** Structure of a grow batch */
export const growStructure: HackScriptType[] = ['grow', 'weaken'];
/** Structure of a money batch */
export const moneyStructure: HackScriptType[] = [
    'hack',
    'weaken',
    'grow',
    'weaken',
];
/** Structure of a exp batch */
export const expStructure: HackScriptType[] = ['hack', 'weaken'];

/** Struct for a combined hacking script and its thread count */
export type HackingScript = {
    script: HackScriptType;
    threads: number;
};
