import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { getState } from '/lib/state';

export class GangModule extends BaseModule {}

/**
 * ### GangModule Uniqueness
 * This modules handles managment of the gang
 */
export const gangModule = new GangModule();
getState.push(gangModule);
