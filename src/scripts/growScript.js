/** @param {NS} ns **/
export async function main(ns, target, ...args) {
    await ns.grow(target);
}
