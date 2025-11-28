/** @param {NS} ns **/
export async function main(ns) {
    throw new Error('Dont use me');
    const target = ns.args[0];
    while (true) await ns.weaken(target);
}
