import { ActiveFragment, NS } from '@ns';

const baseGiftPath = 'stanek/gifts/';

export function getGiftLocation(
    ns: NS,
    giftType: 'hacking' | 'reputation' | 'bladeburner',
): string {
    const width = ns.stanek.giftWidth();
    const height = ns.stanek.giftHeight();
    return `${baseGiftPath}/${giftType}/${width}x${height}.json`;
}

export async function loadStanek(
    ns: NS,
    giftType: 'hacking' | 'reputation' | 'bladeburner',
) {
    while (!ns.fileExists(getGiftLocation(ns, giftType))) {
        ns.tprint('NO STANEK LAYOUT!!! Please create one and save it!');
        await ns.sleep(60_000);
    }
    const layout: ActiveFragment[] = JSON.parse(
        ns.read(getGiftLocation(ns, giftType)),
    );
    ns.stanek.clearGift();
    for (const frag of layout) {
        if (!ns.stanek.canPlaceFragment(frag.x, frag.y, frag.rotation, frag.id))
            throw new Error(
                `Invalid Layout! ${frag.x} ${frag.y} ${frag.rotation} ${frag.id}`,
            );
        ns.stanek.placeFragment(frag.x, frag.y, frag.rotation, frag.id);
    }
}
