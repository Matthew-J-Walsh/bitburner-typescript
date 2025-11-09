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
    public init(ns: NS) {
        this.ns = ns;
        ns.tprint('registering');
        registerPriorityTaskForModule(this);
        registerBackgroundTaskForModule(this);
    }

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
