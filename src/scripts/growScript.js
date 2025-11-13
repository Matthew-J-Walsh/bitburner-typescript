/** @param {NS} ns **/
export async function main(ns) {
    const target = ns.args[0];
    const delay = ns.args[1];
    const endTime = ns.args[2];
    //ns.tprint(
    //    `Starting a grow toward ${target} at time ${Date.now()} with delay ${delay} to end after time ${endTime}`,
    //);
    await ns.grow(target, { additionalMsec: delay });
    //ns.tprint(
    //    `Finished a grow toward ${target} at time ${Date.now()}, was off by ${Date.now() - endTime}`,
    //);
}
