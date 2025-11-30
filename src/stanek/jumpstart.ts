import { NS } from '@ns';

export async function main(ns: NS) {
    const fragments = ns.args as string[];

    for (let frag of fragments) {
        let point = frag.split(',');
        await ns.stanek.chargeFragment(parseInt(point[0]), parseInt(point[1]));
    }
}
