import { NS } from '@ns';
import {
    registerPriorityTaskForModule,
    registerBackgroundTaskForModule,
} from 'schedulingDecorators';

/**
 * Base module for typing
 */
export abstract class BaseModule {
    constructor(protected ns: NS) {
        ns.tprint('registering');
        registerPriorityTaskForModule(this);
        registerBackgroundTaskForModule(this);
    }
}

/**
 * Constructors of children of BaseModule
 */
export type ModuleConstructor<T extends BaseModule = BaseModule> = new (
    ns: NS,
) => T;
