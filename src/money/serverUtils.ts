import { NS } from '@ns';

const minimumPurchasedServerSize: number = 256;
const purchasedServerPrefix = 'pserv';

export class ServerMoneyUtils {
    /** Buys servers with the money given */
    public static purchaseServers(ns: NS, allowedMoney: number) {
        if (allowedMoney > ns.getPlayer().money) throw new Error('WTF moment');

        let purchasedServers = ns.getPurchasedServers();

        while (purchasedServers.length < ns.getPurchasedServerLimit()) {
            let cost = ns.getPurchasedServerCost(minimumPurchasedServerSize);
            if (cost > allowedMoney) return;
            ns.purchaseServer(
                purchasedServerPrefix,
                minimumPurchasedServerSize,
            );
            allowedMoney -= cost;
        }

        purchasedServers = ns.getPurchasedServers();

        for (let i = 0; i < 20; i++) {
            // safe while true loop
            let minRam = ns.getServerMaxRam(purchasedServers[0]);

            for (let pServer of purchasedServers) {
                let serverRam = ns.getServerMaxRam(pServer);
                if (serverRam < minRam) {
                    let cost = ns.getPurchasedServerUpgradeCost(
                        pServer,
                        serverRam * 2,
                    );
                    if (cost > ns.getPlayer().money) return;
                    ns.upgradePurchasedServer(pServer, serverRam * 2);
                    allowedMoney -= cost;
                }
            }

            if (ns.getPurchasedServerMaxRam() === minRam) return;

            let cost = ns.getPurchasedServerUpgradeCost(
                purchasedServers[0],
                minRam * 2,
            );
            if (cost > allowedMoney) return;
            ns.upgradePurchasedServer(purchasedServers[0], minRam * 2);
            allowedMoney -= cost;
        }
    }
}
