import { NS } from '@ns';

const criticalHashPercent = 0.9;

interface HacknetUpgradeValue {
    fn: () => void;
    cost: number;
    value: number;
}

export class Hacknet {
    /** Helper to dump all hashes to money */
    public static liquidateHashes(ns: NS) {
        for (
            let i = 0;
            i < 1000;
            i++ // safe while loop
        )
            if (!ns.hacknet.spendHashes('Sell For Money')) return;
    }

    /** Buys hacknet servers with the money given */
    public static purchaseHacknet(ns: NS, allowedMoney: number) {
        for (let i = 0; i < 1000; i++) {
            // safe while true loop
            let bestUpgrade = Hacknet.bestUpgrade(ns);

            if (bestUpgrade.cost > allowedMoney) return;

            bestUpgrade.fn();
        }
    }

    /** Best hash generation per money investment */
    private static bestUpgrade(ns: NS): HacknetUpgradeValue {
        if (ns.hacknet.numNodes() === 0)
            return {
                fn: () => ns.hacknet.purchaseNode(),
                cost: ns.hacknet.getPurchaseNodeCost(),
                value: 0, // doesn't matter
            };

        // if we are above critical hash amount we assume that we just need to upgrade it
        if (
            ns.hacknet.numHashes() >
            ns.hacknet.hashCapacity() * criticalHashPercent
        ) {
            return Hacknet.bestCacheUpgrade(ns);
        }

        const mainNode = ns.hacknet.getNodeStats(0);

        // we go in the reverse direction to hit the newest purchase first just in case its really low
        for (let nodeIdx = ns.hacknet.numNodes(); nodeIdx > 0; nodeIdx--) {
            let node = ns.hacknet.getNodeStats(nodeIdx);

            if (
                mainNode.level <= node.level &&
                mainNode.ram <= node.ram &&
                mainNode.cores <= node.cores
            )
                continue;

            return Hacknet.singleNodeBestUpgrade(ns, nodeIdx);
        }

        const mainUpgrade = Hacknet.singleNodeBestUpgrade(ns, 0);
        const newServer = Hacknet.newNodeValue(ns);

        return newServer.value > mainUpgrade.value ? newServer : mainUpgrade;
    }

    private static bestCacheUpgrade(ns: NS): HacknetUpgradeValue {
        const mainNode = ns.hacknet.getNodeStats(0);

        for (let nodeIdx = ns.hacknet.numNodes(); nodeIdx > 0; nodeIdx--) {
            let node = ns.hacknet.getNodeStats(nodeIdx);

            if (mainNode.cache === node.cache) continue;

            return {
                fn: () => ns.hacknet.upgradeCache(nodeIdx),
                cost: ns.hacknet.getCacheUpgradeCost(nodeIdx),
                value: 0,
            };
        }

        return {
            fn: () => ns.hacknet.upgradeCache(0),
            cost: ns.hacknet.getCacheUpgradeCost(0),
            value: 0,
        };
    }

    private static singleNodeBestUpgrade(
        ns: NS,
        index: number,
    ): HacknetUpgradeValue {
        const node = ns.hacknet.getNodeStats(index);
        const current = ns.formulas.hacknetServers.hashGainRate(
            node.level,
            0,
            node.ram,
            node.cores,
        );
        const values: HacknetUpgradeValue[] = [
            {
                fn: () => ns.hacknet.upgradeLevel(index),
                cost: ns.hacknet.getLevelUpgradeCost(index),
                value:
                    (ns.formulas.hacknetServers.hashGainRate(
                        node.level + 1,
                        0,
                        node.ram,
                        node.cores,
                    ) -
                        current) /
                    ns.formulas.hacknetServers.levelUpgradeCost(node.level),
            },
            {
                fn: () => ns.hacknet.upgradeRam(index),
                cost: ns.hacknet.getRamUpgradeCost(index),
                value:
                    (ns.formulas.hacknetServers.hashGainRate(
                        node.level,
                        0,
                        node.ram * 2,
                        node.cores,
                    ) -
                        current) /
                    ns.formulas.hacknetServers.ramUpgradeCost(node.ram),
            },
            {
                fn: () => ns.hacknet.upgradeCore(index),
                cost: ns.hacknet.getCoreUpgradeCost(index),
                value:
                    (ns.formulas.hacknetServers.hashGainRate(
                        node.level,
                        0,
                        node.ram,
                        node.cores + 1,
                    ) -
                        current) /
                    ns.formulas.hacknetServers.coreUpgradeCost(node.cores),
            },
        ];

        if (values.length === 0)
            return { fn: () => null, cost: Infinity, value: 0 };

        return values.reduce((best, choice) => {
            if (choice.value > best.value) return choice;
            return best;
        }, values[0]);
    }

    private static newNodeValue(ns: NS): HacknetUpgradeValue {
        if (ns.hacknet.numNodes() === ns.hacknet.maxNumNodes())
            return { fn: () => null, cost: Infinity, value: 0 };

        const mainNode = ns.hacknet.getNodeStats(0);

        const fullCost =
            ns.formulas.hacknetServers.hacknetServerCost(
                ns.hacknet.numNodes() + 1,
            ) +
            ns.formulas.hacknetServers.levelUpgradeCost(1, mainNode.level - 1) +
            ns.formulas.hacknetServers.ramUpgradeCost(
                1,
                Math.log2(mainNode.ram),
            ) +
            ns.formulas.hacknetServers.coreUpgradeCost(1, mainNode.cores - 1);

        return {
            fn: () => ns.hacknet.purchaseNode(),
            cost: ns.hacknet.getPurchaseNodeCost(),
            value:
                ns.formulas.hacknetServers.hashGainRate(
                    mainNode.level,
                    0,
                    mainNode.ram,
                    mainNode.cores,
                ) / fullCost,
        };
    }
}
