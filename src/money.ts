import { NS } from '@ns';

import { StockModule } from './money/stockModule';

/**
 * Manages money (just stocks for now)
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    const stockModule = new StockModule(ns);

    while (true) {
        stockModule.manage();
        await ns.stock.nextUpdate();
    }
}
