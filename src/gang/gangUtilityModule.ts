import { NS } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';

export class GangUtilityModule extends BaseModule {}

/**
 * ### GangUtilityModule Uniqueness
 * This modules handles ????
 */
export const gangUtilityModule = new GangUtilityModule();
state.push(gangUtilityModule);
