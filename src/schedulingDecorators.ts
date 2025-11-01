import { NS } from '@ns';
import { PriorityTask, BackgroundTask } from 'scheduler';
import { ModuleConstructor, BaseModule } from 'baseModule';

export const registeredModules: ModuleConstructor[] = [];
export const registeredPriorityTasks = new WeakMap<BaseModule, string[]>();
export const priorityTasks: PriorityTask[] = [];
export const registeredBackgroundTasks = new WeakMap<
    BaseModule,
    [string, number][]
>();
export const backgroundTasks: BackgroundTask[] = [];

/**
 * Adds a task to the priority scheduler. Such tasks should always the time of their next call in milliseconds
 */
export function PriorityTask() {
    return function (
        target: BaseModule,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const existing = registeredPriorityTasks.get(target) ?? [];
        existing.push(propertyKey);
        registeredPriorityTasks.set(target, existing);
    };
}

/**
 * Registers all the priority tasks of a instance of a module.
 * @param module Module to register priority tasks of
 */
export function registerPriorityTaskForModule(module: BaseModule): void {
    registeredPriorityTasks
        .get(Object.getPrototypeOf(module))
        ?.forEach((propertyKey) =>
            priorityTasks.push({
                name: `${module}.${propertyKey}`,
                fn: (module as any)[propertyKey].bind(module),
                nextRun: Date.now(),
            }),
        );
}

/**
 * Adds a task to the background scheduler. Will be run at most every `interval` milliseconds
 * @param interval minimum re-run interval
 */
export function BackgroundTask(interval: number) {
    return function (
        target: BaseModule,
        propertyKey: string,
        descriptor: PropertyDescriptor,
    ) {
        const existing = registeredBackgroundTasks.get(target) ?? [];
        existing.push([propertyKey, interval]);
        registeredBackgroundTasks.set(target, existing);
    };
}

/**
 * Registers all the background tasks of a instance of a module.
 * @param module Module to register background tasks of
 */
export function registerBackgroundTaskForModule(module: BaseModule): void {
    registeredBackgroundTasks
        .get(Object.getPrototypeOf(module))
        ?.forEach(([propertyKey, interval]) =>
            backgroundTasks.push({
                name: `${module}.${propertyKey}`,
                fn: (module as any)[propertyKey].bind(module),
                interval,
                nextRun: Date.now(),
            }),
        );
}

/**
 * Registers a module into the state, required for module values to populate state for display
 */
export function RegisteredModule(target: any): any {
    registeredModules.push(target);
}

/**
 * Initializes all the registered modules
 * @param ns NS
 */
//export async function initalizeModules(ns: NS) {
//    registeredModules.forEach((module) => state.push(new module(ns)));
//}
