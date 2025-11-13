import { NS } from '@ns';
import { BackgroundTask, PriorityTask, Scheduler } from '/lib/scheduler';
import { BaseModule } from '/lib/baseModule';

// Loaded modules:
//import { TestingModule, TestingModuleTwo } from '/testing/testingModule';
import { LoggingModule } from '/lib/loggingModule';
import { ServerUtilityModule } from './hacking/serverUtilityModule';
import { HackingUtilityModule } from './hacking/hackingUtilityModule';
import { HackingSchedulerModule } from './hacking/hackingModule';
import { MoneyModule } from './core/money/moneyModule';

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const loggingModule = new LoggingModule(ns);
    const serverUtilityModule = new ServerUtilityModule(ns);
    const hackingUtilityModule = new HackingUtilityModule(
        ns,
        serverUtilityModule,
    );
    const hackingSchedulerModule = new HackingSchedulerModule(
        ns,
        serverUtilityModule,
        hackingUtilityModule,
    );
    const moneyModule = new MoneyModule(ns, serverUtilityModule);
    const allModules: BaseModule[] = [
        loggingModule,
        serverUtilityModule,
        hackingUtilityModule,
        hackingSchedulerModule,
        moneyModule,
    ];
    loggingModule.init(allModules);

    const backgroundTasks = allModules.reduce(
        (tasks: BackgroundTask[], module: BaseModule) =>
            tasks.concat(module.registerBackgroundTasks()),
        [],
    );
    const priorityTasks = allModules.reduce(
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
