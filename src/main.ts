import { NS } from '@ns';
import { Scheduler } from '/lib/scheduler';
import { priorityTasks, backgroundTasks } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state, prepareStateForLogging } from '/lib/state';

// Loaded modules:
//import '/testing/testingModule';
import '/lib/loggingModule';
import '/hacking/serverUtilityModule';
import '/hacking/hackingUtilityModule';
import '/hacking/hackingModule';
import '/core/money/moneyModule';

export async function main(ns: NS) {
    ns.disableLog('ALL');

    priorityTasks.length = 0;
    backgroundTasks.length = 0;

    state.forEach((module: BaseModule) => module.init(ns));

    prepareStateForLogging(ns);

    const scheduler = new Scheduler(ns, priorityTasks, backgroundTasks);

    ns.tprint(
        `Scheduler initialized with ${state.length} modules, ${priorityTasks.length} priority tasks, and ${backgroundTasks.length} background tasks.`,
    );

    while (true) {
        const sleepTime = await scheduler.fire();
        await ns.sleep(Math.max(1, sleepTime));
    }
}
