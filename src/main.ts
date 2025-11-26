import { NS } from '@ns';
import { HackingModule } from './hacking/hackingModule';
import { ScriptNetscriptPort } from './ports';
import { ScriptPortCommunication } from './hacking/constants';

/**
 * Handles RAM management
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const scriptsToFire = [
        'gang.js',
        //
    ];

    ns.clearPort(ScriptNetscriptPort);
    for (let script of scriptsToFire) {
        ns.writePort(ScriptNetscriptPort, {
            script: script,
            expectedDuration: Infinity,
        });
    }

    const hackingModule = new HackingModule(ns);

    while (true) {
        const nextRun = hackingModule.manageQueue();
        hackingModule.refill();
        await ns.sleep(Math.max(1, nextRun));
    }
}
