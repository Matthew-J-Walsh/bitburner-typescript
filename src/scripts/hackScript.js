/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    //ns.tprint(`Starting a hack toward ${target} at time ${Date.now()}`);
    await ns.hack(target);
    //ns.tprint(`Finished a hack toward ${target} at time ${Date.now()}`);
}
