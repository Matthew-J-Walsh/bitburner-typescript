/** @param {NS} ns **/
export async function main(ns) {
    const fragments = ns.args;

    while (true) {
        let frag = fragments[Math.floor(Math.random() * fragments.length)];
        let point = frag.split(',');
        for (let i = 0; i < 10; i++)
            await ns.stanek.chargeFragment(
                parseInt(point[0]),
                parseInt(point[1]),
            );
    }
}
