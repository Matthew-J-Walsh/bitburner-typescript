import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { trackedProperties } from '/lib/schedulingDecorators';

/** Full state of all values for display */
export const state: BaseModule[] = [];

let fieldMap: Map<BaseModule, string[]>;

/** Prepares the fields that should be logged for each module */
export function prepareStateForLogging(ns: NS) {
    fieldMap = new Map();

    state.forEach((module) => {
        const keys = trackedProperties.get(Object.getPrototypeOf(module));
        if (!keys) return;
        fieldMap.set(module, keys);
        ns.tprint(`${module} has ${keys.length} tracked properties`);
    });
}

/** Extracts current data and appends it to the current storage file */
export function logStateJSONL(ns: NS, filename: string) {
    const snapshot: Record<string, Record<string, any>> = Object.fromEntries(
        state.map((module) => {
            const keys = fieldMap.get(module) ?? [];

            // Build tracked properties object
            const trackedObj: Record<string, any> = Object.fromEntries(
                keys.map((key) => [key, (module as any)[key]]),
            );

            // Allow module to provide additional log entries via log()
            const extra: Record<string, string> =
                typeof (module as any).log === 'function'
                    ? (module as any).log()
                    : {};

            // Warn on overlapping keys and prefer tracked properties when merging
            Object.keys(extra).forEach((k) => {
                if (k in trackedObj) {
                    ns.tprint(
                        `Warning: module ${module.constructor.name} log() key '${k}' overlaps a tracked property; tracked value will be kept.`,
                    );
                }
            });

            const merged = { ...extra, ...trackedObj };

            return [module.constructor.name, merged];
        }),
    );

    ns.write(filename, JSON.stringify(snapshot) + '\n', 'a');
}

/** Gets the filename of the next log file */
export function getNextLogFile(ns: NS): string {
    const folder = '/logs/BN-1-1/';
    const files = ns.ls('home', folder);
    const numbers = files
        .map((f) => f.match(/logs\/BN-1-1\/(\d+)\.txt$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => parseInt(m[1], 10))
        .filter((n) => !isNaN(n));

    const next = numbers.length === 0 ? 1 : Math.max(...numbers) + 1;

    ns.tprint(`Log file is: ${folder}${next}.txt`);

    return `${folder}${next}.txt`;
}
