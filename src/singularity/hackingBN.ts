import { NS } from '@ns';
import { checkReset, runReset } from './resets/resets';
import { Reset } from './constants';
import { HackingResetFactionTable } from './resets/faction';

const HackingBNDefinition: Array<Reset> = [
    { type: 'grafting', augName: 'OmniTek InfoLoad' },
    { type: 'grafting', augName: 'Neuronal Densification' },
    //{'type': 'grafting', augName: 'nextSENS Gene Modification'},
    HackingResetFactionTable['Tian Di Hui'],
    HackingResetFactionTable['CSEC'],
    HackingResetFactionTable['NiteSec'],
    HackingResetFactionTable['Bitrunners 1'],
    HackingResetFactionTable['Bitrunners 2'],
    HackingResetFactionTable['Bitrunners 3'],
    HackingResetFactionTable['Bitrunners 4'],
    { type: 'neuroflux', target: 50, count: 10 },
    HackingResetFactionTable['Daedalus 1'],
    HackingResetFactionTable['Daedalus 2'],
    HackingResetFactionTable['Daedalus 3'],
    HackingResetFactionTable['Daedalus 4'],
];

export async function HackingBN(ns: NS): Promise<void> {
    for (let i = 0; i < HackingBNDefinition.length; i++)
        if (!checkReset(ns, HackingBNDefinition[i]))
            await runReset(ns, HackingBNDefinition[i]);
}
