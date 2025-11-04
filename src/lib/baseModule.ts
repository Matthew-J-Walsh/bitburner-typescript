import { NS } from '@ns';
import {
    registerPriorityTaskForModule,
    registerBackgroundTaskForModule,
} from '/lib/schedulingDecorators';

/** Base module for typing */
export abstract class BaseModule {
    protected ns!: NS;

    constructor() {}

    /** Initializes the module */
    init(ns: NS) {
        this.ns = ns;
        ns.tprint('registering');
        registerPriorityTaskForModule(this);
        registerBackgroundTaskForModule(this);
    }
}

/** Constructors of children of BaseModule */
export type ModuleConstructor<T extends BaseModule = BaseModule> = new (
    ns: NS,
) => T;
