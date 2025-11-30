import { NS } from '@ns';
import { runCasino } from './singularity/resets/casino';
import { startUpScript } from './singularity/constants';
import { loadStanek } from './stanek/stanekUtils';

/**
 * This script runs the startup process on reset.
 * In general we need to do the following two things:
 * If we are kinda poor (aka not in gang/corp that is feeding us money), we steal from the casino
 * If we have stanek we set it up and then kill ourself to spawn the stanek initial charge script
 * Finally we pass that charge script to start main with a bunch of inputs that we care about.
 * If we don't have stanek we just spawn main with a bunch of inputs we care about.
 * Its mains job to start singularity that controls the rest of the process (we pass main singularity)
 */

export async function main(ns: NS) {
    ns.disableLog('ALL');

    if (ns.corporation.hasCorporation() || ns.gang.inGang()) ns.sleep(10_000); //wait some time to get some income to see if we need casino

    if (ns.getPlayer().money < 1e8) {
        await runCasino(ns);
    }

    if (ns.getPlayer().money < 9.9e9) {
        // We bought something with the casino run
        ns.singularity.softReset(startUpScript);
    }

    const triggeredScripts: string[] = [];

    triggeredScripts.push('singularity.js');
    if (ns.gang.inGang()) triggeredScripts.push('gang.js');
    if (ns.bladeburner.inBladeburner()) triggeredScripts.push('bladeburner.js');

    if (ns.stanek.acceptGift()) {
        loadStanek(
            ns,
            ns.singularity.getOwnedAugmentations().includes('The Red Pill')
                ? 'hacking'
                : 'reputation',
        );

        const fragments = ns.stanek.activeFragments();
        const chargableFragments = fragments
            .filter((frag) => frag.id < 100)
            .map((frag) => `${frag.x},${frag.y}`);

        ns.run('stanek/spawnJumpstart.js', 1, ...chargableFragments);
        ns.spawn(
            'main.js',
            { spawnDelay: chargableFragments.length * 1100 + 5_500 }, // Theoretically only 1000ms per charge
            ...triggeredScripts,
        );
    } else ns.spawn('main.js', { spawnDelay: 500 }, ...triggeredScripts);
}
