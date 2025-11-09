import { NS } from '@ns';
import { BackgroundTask, PriorityTask } from '/lib/schedulingDecorators';
import { BaseModule } from '/lib/baseModule';
import { state } from '/lib/state';

export class GangModule extends BaseModule {}

/**
 * ### GangModule Uniqueness
 * This modules handles managment of the gang
 */
export const gangModule = new GangModule();
state.push(gangModule);
