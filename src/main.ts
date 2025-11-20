import { NS } from '@ns';

import { ServerUtilityModule } from './hacking/serverUtilityModule';
import { HackingUtilityModule } from './hacking/hackingUtilityModule';
import { HackingSchedulerModule } from './hacking/hackingSchedulerModule';

/**
 * Handles RAM management
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const scriptsToFire = [
        'gang.js',
        //
    ];

    const serverUtilityModule = new ServerUtilityModule(ns, scriptsToFire);
    const hackingUtilityModule = new HackingUtilityModule(
        ns,
        serverUtilityModule,
    );
    const hackingSchedulerModule = new HackingSchedulerModule(
        ns,
        serverUtilityModule,
        hackingUtilityModule,
    );

    const subProcesses: {
        nextRun: number;
        fn: () => number;
    }[] = [
        {
            nextRun: 0,
            fn: serverUtilityModule.rootServers,
        },
        {
            nextRun: 0,
            fn: serverUtilityModule.refreshTargetable,
        },
        {
            nextRun: 0,
            fn: hackingUtilityModule.moneyUpdate,
        },
        {
            nextRun: 0,
            fn: hackingUtilityModule.expUpdate,
        },
        {
            nextRun: 0,
            fn: hackingUtilityModule.decideRamProportioning,
        },
        {
            nextRun: 0,
            fn: hackingSchedulerModule.update,
        },
    ];

    while (true) {
        let now = Date.now();
        const nextRun = hackingSchedulerModule.manageActiveScripts();
        if (nextRun > now + 100)
            subProcesses.forEach((subprocess) => {
                if (now >= subprocess.nextRun)
                    subprocess.nextRun = subprocess.fn();
            });
        await ns.sleep(Math.max(1, nextRun));
    }
}
