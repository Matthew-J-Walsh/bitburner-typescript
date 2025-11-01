import { NS } from '@ns';
import { Scheduler } from 'scheduler';
import {
    registeredModules,
    priorityTasks,
    backgroundTasks,
} from 'schedulingDecorators';
import { ModuleConstructor } from 'baseModule';
import { state, prepareFieldMap } from 'state';

// Loaded modules:
import 'testingModule';
import 'loggingModule';

export async function main(ns: NS) {
    ns.disableLog('ALL');

    //ns.tprint();
    //ns.tprint(priorityTasks.length);
    //ns.tprint(backgroundTasks.length);
    priorityTasks.length = 0;
    backgroundTasks.length = 0;

    registeredModules.forEach((moduleConstructor: ModuleConstructor) =>
        state.push(new moduleConstructor(ns)),
    );

    prepareFieldMap(ns);

    const scheduler = new Scheduler(ns, priorityTasks, backgroundTasks);

    ns.tprint(
        `Scheduler initialized with ${registeredModules.length} modules, ${priorityTasks.length} priority tasks, and ${backgroundTasks.length} background tasks.`,
    );

    while (true) {
        const sleepTime = await scheduler.fire();
        await ns.sleep(Math.max(1, sleepTime));
    }
}
