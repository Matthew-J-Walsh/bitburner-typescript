import { NS } from '@ns';
import { BackgroundTask, PriorityTask, Scheduler } from '/lib/scheduler';
import { BaseModule } from '/lib/baseModule';

// Loaded modules:
//import { TestingModule, TestingModuleTwo } from '/testing/testingModule';
import { LoggingUtility } from './lib/loggingUtils';
import { ServerUtilityModule } from './hacking/serverUtilityModule';
import { HackingUtilityModule } from './hacking/hackingUtilityModule';
import { HackingSchedulerModule } from './hacking/hackingSchedulerModule';
import { MoneyModule } from './core/money/moneyModule';
import { GangModule } from './gang/gangModule';

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const modules: Record<string, BaseModule> = {};
    modules['loggingModule'] = new LoggingUtility(ns);
    modules['serverUtilityModule'] = new ServerUtilityModule(ns);
    modules['hackingUtilityModule'] = new HackingUtilityModule(
        ns,
        modules['serverUtilityModule'] as ServerUtilityModule,
    );
    modules['hackingSchedulerModule'] = new HackingSchedulerModule(
        ns,
        modules['serverUtilityModule'] as ServerUtilityModule,
        modules['hackingUtilityModule'] as HackingUtilityModule,
    );
    modules['gangModule'] = new GangModule(ns);

    modules['moneyModule'] = new MoneyModule(
        ns,
        modules['hackingUtilityModule'] as HackingUtilityModule,
        modules['gangModule'] as GangModule,
    ); //serverUtilityModule
    (modules['loggingModule'] as LoggingUtility).init(Object.values(modules));

    const backgroundTasks = Object.values(modules).reduce(
        (tasks: BackgroundTask[], module: BaseModule) =>
            tasks.concat(module.registerBackgroundTasks()),
        [],
    );
    const priorityTasks = Object.values(modules).reduce(
        (tasks: PriorityTask[], module: BaseModule) =>
            tasks.concat(module.registerPriorityTasks()),
        [],
    );

    const scheduler = new Scheduler(ns, priorityTasks, backgroundTasks);

    ns.tprint(
        `Scheduler initialized with ${priorityTasks.length} priority tasks, and ${backgroundTasks.length} background tasks.`,
    );

    while (true) {
        const sleepTime = await scheduler.fire();
        await ns.sleep(Math.max(1, sleepTime));
    }
}
