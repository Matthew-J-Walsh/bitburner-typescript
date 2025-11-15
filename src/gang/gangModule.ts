import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { getState } from '/lib/state';

/**
 * ### GangModule Uniqueness
 * This modules handles managment of the gang
 */
export class GangModule extends BaseModule {
    stage: number = 0;

    constructor(ns: NS) {
        super(ns);
        const stats = ns.gang.getTaskStats('');
    }

    //prio task
    manageStage0(): number {
        if (this.stage === 1) return 1000_000;
    }

    //background task
    manageStage1(): number {
        if (this.stage === 0) return 1000_000;
    }
}
