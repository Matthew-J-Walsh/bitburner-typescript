import { NS } from '@ns';
import { BaseModule } from '/lib/baseModule';
import { BackgroundTask, PriorityTask } from '/lib/scheduler';

/**
 * ### StockModule Uniqueness
 * This modules handles the full managment of the stock market
 */
export class StockModule extends BaseModule {
    constructor(protected ns: NS) {
        super(ns);
    }
}

/**
 * Btw shorting works by: buying the stock, sell to gain the money back + difference
 * So basically I invest money on the upturn, wait for the downturn, and every downturn i 'gain' money over the stock to reinvest
 *
 * The value of a stock directly at the moment is:
 * .mv aka getVolatility * .ot1kMag aka getForecast * some spread factor * some short vs long factor
 *
 * For manipulation we like stocks that:
 * - Aren't too close to their cap (when they hit their cap they will invert 2nd order forecast,
 *      This is actually the only way we can detect their cap)
 *   * Its actually very hard to detect this as we cannot directly read the second order
 * - Have a high mv
 * - Low spread
 * - Large number of shares (more important later as we get more money)
 * - Easily influenced all that matters is the connected server (every hack gives me .1 so you need 1000 hacks + grows to hit to fully flip a server)
 */
