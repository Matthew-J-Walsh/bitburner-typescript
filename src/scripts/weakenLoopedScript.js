/** @param {NS} ns **/
export async function main(ns, target) {
    while (true) await ns.weaken(target);
}
