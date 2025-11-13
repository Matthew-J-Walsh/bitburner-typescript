import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { getState } from '/lib/state';

/**
 * Notes:
 * To optimize rep we want to go for: respect gained - wanted gained
 * To optimize money we want to go for: money gained * (1 - wanted gained / rep gained)
 * Stats is obvious
 * For the time being we focus entirely on building out our gang until we hit territory cap
 *
 * Following standard temporal math we are trying to maximize stat gain, thus:
 * The multiplier of an upgrade is its average multiplier on our stats that we train (so maybe not hacking)
 * The cost of an upgrade is the time loss to obtain it so if it halves our stat gain for 50s that is 25s cost
 * The multiplier of an additional unit is new units / old units
 * The cost of an additional unit is the time it takes to build up the rep
 * The multiplier of exp is the ascension bonus
 *
 *
 * We reset at at least 45% of our current total xp across ascensions
 * We get up to at least 50%? the top level before we stop just training (or some baseline level on rip)
 * We only reset if the loss is below like X%?
 * Rep has an additional continuous cost for continuous multiplier
 *
 * For territory, we make sure that on average our gang members combined will get like 2-5x the power of the top gang before we go for territory
 * Effectively the game is a race to getting our power to some point
 *
 * Good hunting
 */

export class GangUtilityModule extends BaseModule {}

/**
 * ### GangUtilityModule Uniqueness
 * This modules handles ????
 */
export const gangUtilityModule = new GangUtilityModule();
getState.push(gangUtilityModule);
