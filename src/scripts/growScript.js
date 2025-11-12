/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    //ns.tprint(`Starting a grow toward ${target} at time ${Date.now()}`);
    await ns.grow(target);
    //ns.tprint(`Finished a grow toward ${target} at time ${Date.now()}`);
}
