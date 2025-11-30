import { NS } from '@ns';
import { defaultSleepTime } from '../constants';

//These shouldn't actually be called inside a normal BN definition, only start.ts

export function checkCasinoReset(ns: NS) {
    const stockConstants = ns.stock.getConstants();
    const bnMultis = ns.getBitNodeMultipliers();
    return !(
        ns.singularity.getUpgradeHomeRamCost() < 1e10 ||
        ns.singularity.getUpgradeHomeCoresCost() < 1e10 ||
        stockConstants.MarketData4SCost * bnMultis.FourSigmaMarketDataCost >
            1e10 ||
        ns.stock.has4SData() ||
        stockConstants.MarketDataTixApi4SCost *
            bnMultis.FourSigmaMarketDataApiCost >
            1e10 ||
        ns.stock.has4SDataTIXAPI()
    );
}

export async function runCasino(ns: NS) {
    const casinoPID = ns.exec('casino.js', 'home');

    while (ns.isRunning(casinoPID)) await ns.sleep(defaultSleepTime);

    ns.singularity.upgradeHomeRam();
    ns.singularity.upgradeHomeCores();
    ns.stock.purchase4SMarketData();
    ns.stock.purchase4SMarketDataTixApi();
}
