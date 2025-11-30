import { NS } from '@ns';
import { getGiftLocation } from './stanekUtils';

export async function main(ns: NS) {
    //type: 'hacking' | 'reputation' | 'bladeburner'
    const giftType = ns.args[0];
    if (
        giftType === 'hacking' ||
        giftType === 'reputation' ||
        giftType === 'bladeburner'
    )
        ns.write(
            getGiftLocation(ns, giftType),
            JSON.stringify(ns.stanek.activeFragments()),
            'w',
        );
    else throw new Error('Give a proper giftType');
}
