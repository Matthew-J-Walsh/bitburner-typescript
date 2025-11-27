import { NS } from '@ns';
import { Hacknet } from './money/hacknet';

/**
 * Liquidates all money in hacknet and stocks
 */

export async function main(ns: NS) {
    Hacknet.liquidateHashes(ns);

    ns.stock.getSymbols().forEach((symbol) => {
        ns.stock.sellStock(symbol, Infinity);
        ns.stock.sellShort(symbol, Infinity);
    });
}
