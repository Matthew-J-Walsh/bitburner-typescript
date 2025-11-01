import { NS } from '@ns';
import { BaseModule } from 'baseModule';

/**
 * Full state of all values for display
 */
export const state: BaseModule[] = [];

let fieldMap: Map<BaseModule, string[]>;

/**
 * Prepares the fields that should be logged for each module
 */
export function prepareFieldMap(ns: NS) {
    fieldMap = new Map();

    state.forEach((module) => {
        const keys = Object.keys(module).filter(
            (k) => k !== 'ns' && typeof (module as any)[k] !== 'function',
        );
        fieldMap.set(module, keys);
        ns.tprint(`${module} has ${keys.length} fields`);
    });
}

/**
 * Extracts current data and appends it to the current storage file
 */
export function logStateJSONL(ns: NS, filename: string) {
    const snapshot: Record<string, Record<string, any>> = Object.fromEntries(
        state.map((module) => {
            const keys = fieldMap.get(module);
            if (!keys) return [module.constructor.name, {}];

            return [
                module.constructor.name,
                Object.fromEntries(
                    keys.map((key) => [key, (module as any)[key]]),
                ),
            ];
        }),
    );

    ns.write(filename, JSON.stringify(snapshot) + '\n', 'a');
}

/**
 * Gets the filename of the next log file
 */
export function getNextLogFile(ns: NS): string {
    const folder = '/logs/BN-1-1/';
    const files = ns.ls('home', folder);

    const numbers = files
        .map((f) => f.match(/\/logs\/BN-1-1\/(\d+)\.txt$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => parseInt(m[1], 10))
        .filter((n) => !isNaN(n));

    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;

    return `${folder}${next}.txt`;
}
