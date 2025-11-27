import { NS } from '@ns';
import { LoggingUtility } from '/lib/loggingUtils';

/**
 * Ok the concept here is that there are precisely 3 cases:
 * - Stocks are the best option period
 * - Stocks are the best option, but we would like to actually get something:
 *   * Hacknet for corp/bladeburner
 *   * Gang stuff for gang progression or because its giga cost efficient after progression
 *   * Servers for hacking levels
 *   This means that we need to make money with stocks to supply these, so we cannot spend all our money
 * - Stocks aren't the best option
 * Which state we are in is not dynamic in the slighest and is usually massively obvious
 *
 * We can handle all 3 of these with one value: MaximumTotalInvesments, respectively with value:
 * - Infinity
 * - Some reasonable value, usually not dynamic until we are close to resetting
 * - 0
 */
