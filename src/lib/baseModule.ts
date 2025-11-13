import { NS } from '@ns';
import { BackgroundTask, PriorityTask } from './scheduler';

/**
 * Time before another priority task that background tasks are blocked in order to prevent overrun
 */
const backgroundBlockTime = 200;

/** Base module for typing */
export abstract class BaseModule {
    constructor(protected ns: NS) {}

    /** Returns the background tasks for this module */
    public abstract registerBackgroundTasks(): BackgroundTask[];
    /** Returns the priority tasks for this module */
    public abstract registerPriorityTasks(): PriorityTask[];

    /**
     * Optional module-specific logging hook.
     * Override in subclasses to return additional key->any entries to be
     * injected into the log output for this module. The default implementation
     * returns an empty record.
     * @returns Record of string keys to any values to include in logs
     */
    public log(): Record<string, any> {
        return {};
    }
}

/** Constructors of children of BaseModule */
export type ModuleConstructor<T extends BaseModule = BaseModule> = new (
    ns: NS,
) => T;
