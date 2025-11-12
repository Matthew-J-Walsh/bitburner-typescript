import { NS, ScriptArg } from '@ns';

export async function main(ns: NS): Promise<void> {
    ns.tprint('Hello Remote API!');
    ns.tprint(ns.hackAnalyzeSecurity(1));
    ns.hackAnalyze;
    ns.tprint(ns.growthAnalyzeSecurity(1));
    ns.tprint(ns.weakenAnalyze(1));
    start(ns);
}

function start(ns: NS, ...args: ScriptArg[]) {
    ns.tprint(
        ns.exec(
            'scripts/weakenLoopedScript.js',
            'pserv-1-23',
            36,
            'phantasy',
            Date.now(),
            ...args,
        ),
    );
}
