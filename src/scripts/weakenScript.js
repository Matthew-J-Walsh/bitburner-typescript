/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    //ns.tprint(`Starting a weaken toward ${target} at time ${Date.now()}`);
    await ns.weaken(target);
    //ns.tprint(`Finished a weaken toward ${target} at time ${Date.now()}`);
}
